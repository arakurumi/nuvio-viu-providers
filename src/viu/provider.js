import { createHttpClient } from '../shared/http.js';
import { createLogger } from '../shared/log.js';
import { resolveTitles } from '../shared/tmdb.js';
import { toPositiveInt } from '../shared/text.js';
import { createViuClient } from './client.js';
import { VIU } from './config.js';
import { categoryIsMovie, findBestMatch } from './matching.js';
import { buildStreams, isDrmProtected, isSingleMovieProduct, pickEpisode } from './playback.js';
import { buildRequestHeaders, createSession, readSettings } from './session.js';

/**
 * Viu Indonesia provider entry point.
 *
 * Nuvio calls this with the content id, media type and episode coordinates.
 * Account cookies come from the plugin settings; every request goes to Viu's
 * own web API. TMDB is used only to turn the id into a title.
 *
 * @param {string} contentId
 * @param {string} mediaType
 * @param {number|null} season
 * @param {number|null} episode
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getStreams(contentId, mediaType, season, episode) {
  const log = createLogger(VIU.label);

  try {
    return await resolveStreams(contentId, mediaType, season, episode, log);
  } catch (error) {
    log.error(`Unexpected error: ${error && error.message ? error.message : error}`);
    return [];
  }
}

/**
 * @param {string} contentId
 * @param {string} mediaType
 * @param {number|null} season
 * @param {number|null} episode
 * @param {ReturnType<typeof createLogger>} log
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function resolveStreams(contentId, mediaType, season, episode, log) {
  const settings = readSettings();
  const session = createSession(settings);

  if (!session.token) {
    log.error('Missing Viu cookie token. Paste a viu.com cookie that contains the "token" value.');
    return [];
  }

  const http = createHttpClient({
    userAgent: VIU.userAgent,
    accept: 'application/json, text/plain, */*',
    budgetMs: VIU.budgetMs,
    startedAt: Date.now(),
    log,
  });
  const client = createViuClient({ http, log, session });

  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const seasonNumber = toPositiveInt(season);
  const episodeNumber = toPositiveInt(episode) || 1;
  log.info(`Request id=${contentId} type=${type} season=${seasonNumber} episode=${episodeNumber}`);

  const meta = await resolveTitles({
    contentId,
    mediaType: type,
    http,
    log,
    countryPriority: VIU.titleCountryPriority,
  });

  if (!meta.titles.length) {
    log.warn('No title candidates available; cannot search Viu.');
    return [];
  }

  const match = await findBestMatch({
    titles: meta.titles,
    mediaType: type,
    season: seasonNumber,
    search: client.search,
    log,
  });
  if (!match) return [];

  const detail = await client.getDetail(match.item.product_id);
  if (!detail || !detail.current_product) {
    log.warn('The Viu detail response has no current_product.');
    return [];
  }

  const current = detail.current_product;
  const seriesId = current.series_id || match.item.series_id;
  const movieContent = categoryIsMovie(detail.series);
  let product = null;

  if (type === 'movie') {
    product = movieContent ? current : await resolveMovieProduct(client, seriesId, log);
  } else {
    if (movieContent) {
      log.info('Matched content is a movie, ignoring it for a TV request.');
      return [];
    }

    product = await resolveEpisodeProduct({
      client,
      current,
      seriesId,
      season: seasonNumber,
      episode: episodeNumber,
      hasSeasonSuffix: match.parsed.season !== null,
      log,
    });
  }

  if (!product) {
    log.info(
      type === 'movie'
        ? 'No playable movie product was found.'
        : `Episode not found: season ${seasonNumber} episode ${episodeNumber}.`
    );
    return [];
  }

  if (!product.ccs_product_id) {
    log.warn('The selected product has no ccs_product_id.');
    return [];
  }

  const playback = await client.getPlayback(product.ccs_product_id);
  if (!playback) {
    log.warn('Playback returned no stream.');
    return [];
  }

  if (isDrmProtected(playback)) {
    log.info('Stream is DRM protected, skipping.');
    return [];
  }

  const episodeLabel = toPositiveInt(product.number) || episodeNumber;
  const label = type === 'movie' ? 'Movie' : `Episode ${episodeLabel}`;
  const streams = buildStreams({ stream: playback, detail, label, settings });

  log.info(`Returning ${streams.length} stream(s).`);
  return streams;
}

/**
 * Some movies are published as a one-product series numbered 0.
 *
 * @param {ReturnType<typeof createViuClient>} client
 * @param {string|number|undefined} seriesId
 * @param {ReturnType<typeof createLogger>} log
 * @returns {Promise<Record<string, any>|null>}
 */
async function resolveMovieProduct(client, seriesId, log) {
  const products = await client.getProducts(seriesId);
  if (isSingleMovieProduct(products)) return products[0];

  log.info('The matched content is not a movie, ignoring it.');
  return null;
}

/**
 * Viu numbers episodes per series. The index fallback is only safe when the
 * request is not clearly asking for a later season.
 *
 * @param {object} options
 * @param {ReturnType<typeof createViuClient>} options.client
 * @param {Record<string, any>} options.current
 * @param {string|number|undefined} options.seriesId
 * @param {number|null} options.season
 * @param {number} options.episode
 * @param {boolean} options.hasSeasonSuffix
 * @param {ReturnType<typeof createLogger>} options.log
 * @returns {Promise<Record<string, any>|null>}
 */
async function resolveEpisodeProduct({ client, current, seriesId, season, episode, hasSeasonSuffix, log }) {
  const products = await client.getProducts(seriesId);

  if (!products.length) {
    if (Number(current.number) === episode) return current;
    log.warn(`No episode list returned for series ${seriesId}.`);
    return null;
  }

  if (isSingleMovieProduct(products)) {
    log.info('Matched content is a movie, ignoring it for a TV request.');
    return null;
  }

  const allowIndexFallback = season === null || season <= 1 || hasSeasonSuffix;
  return pickEpisode(products, episode, allowIndexFallback, log);
}
