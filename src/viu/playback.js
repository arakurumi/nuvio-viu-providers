import { buildStream } from '../shared/media.js';
import { QUALITIES, VIU } from './config.js';

/**
 * Formats the byte count Viu reports for a quality into a short label.
 *
 * @param {unknown} bytes
 * @returns {string|null}
 */
function formatSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return null;

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  const rounded = size >= 100 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${rounded} ${units[index]}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeSubtitleLanguage(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z-]/g, '');
}

/**
 * Builds the subtitle tracks from the detail payload. Viu serves SRT without
 * a file extension; Nuvio's player treats unknown extensions as SubRip.
 *
 * @param {Record<string, any>|null} detail
 * @returns {Array<{ url: string, language: string, name: string, headers: Record<string, string> }>}
 */
export function buildSubtitles(detail) {
  const subtitles = (detail && detail.current_product && detail.current_product.subtitle) || [];
  const seen = {};
  const result = [];
  const headers = { 'User-Agent': VIU.userAgent, Referer: `${VIU.baseUrl}/` };

  for (const subtitle of subtitles) {
    if (!subtitle || !subtitle.url) continue;

    const language = normalizeSubtitleLanguage(subtitle.iso_code || subtitle.code || subtitle.name);
    if (!language || seen[language]) continue;
    seen[language] = true;

    result.push({
      url: subtitle.url,
      language,
      name: subtitle.name || language,
      headers,
    });
  }

  // Prefer Indonesian and English tracks; keep Viu's order for the rest.
  const priority = { id: 0, en: 1 };
  result.sort((a, b) => {
    const left = priority[a.language] === undefined ? 99 : priority[a.language];
    const right = priority[b.language] === undefined ? 99 : priority[b.language];
    return left - right;
  });

  return result;
}

/**
 * A single-video series (a movie published as one product numbered 0).
 * `product_total` is unreliable because Viu also reports 9999 for series.
 *
 * @param {Array<Record<string, any>>} products
 * @returns {boolean}
 */
export function isSingleMovieProduct(products) {
  return products.length === 1 && Number(products[0].number) === 0;
}

/**
 * Picks the requested episode from a Viu product list.
 *
 * @param {Array<Record<string, any>>} products
 * @param {number} episode
 * @param {boolean} allowIndexFallback
 * @param {ReturnType<import('../shared/log.js').createLogger>} log
 * @returns {Record<string, any>|null}
 */
export function pickEpisode(products, episode, allowIndexFallback, log) {
  if (!Number.isFinite(episode) || !products.length) return null;

  const exact = products.find((product) => Number(product.number) === episode);
  if (exact) return exact;

  if (!allowIndexFallback) return null;

  const ordered = products.slice().sort((a, b) => Number(a.number) - Number(b.number));
  if (episode >= 1 && episode <= ordered.length) {
    log.info(`Episode ${episode} has no exact number, using position ${episode}.`);
    return ordered[episode - 1];
  }

  return null;
}

/**
 * @param {Record<string, any>|null} stream
 * @returns {boolean}
 */
export function isDrmProtected(stream) {
  const flag = String((stream && stream.is_drm) || '').toLowerCase();
  return flag === 'y' || flag === 'yes' || flag === 'true' || flag === '1';
}

/**
 * Turns the playback payload into Nuvio streams, best quality first.
 *
 * @param {object} options
 * @param {Record<string, any>} options.stream
 * @param {Record<string, any>|null} options.detail
 * @param {string} options.label Episode or movie label.
 * @param {Record<string, any>} options.settings
 * @returns {Array<Record<string, any>>}
 */
export function buildStreams({ stream, detail, label, settings }) {
  const urls = (stream && stream.url) || {};
  const sizes = (stream && stream.size) || {};
  const subtitles = settings.includeSubtitles === false ? [] : buildSubtitles(detail);
  const seen = {};
  const streams = [];

  for (const quality of QUALITIES) {
    const url = urls[quality.key];
    if (!url || typeof url !== 'string' || seen[url]) continue;
    seen[url] = true;

    streams.push(
      buildStream({
        name: VIU.label,
        provider: VIU.providerId,
        title: `${label} • ${quality.label}`,
        url,
        quality: quality.label,
        type: 'hls',
        language: VIU.locale,
        referer: `${VIU.baseUrl}/`,
        size: formatSize(sizes[quality.key]),
        subtitles,
        userAgent: VIU.userAgent,
      })
    );

    if (streams.length >= VIU.maxStreams) break;
  }

  return streams;
}
