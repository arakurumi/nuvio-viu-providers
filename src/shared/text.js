/**
 * Decodes the HTML entities that Viu titles and attributes contain.
 *
 * @param {unknown} value
 * @returns {string}
 */
function decodeEntities(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, decimal) => String.fromCharCode(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function cleanText(value) {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

/**
 * Lowercases, strips diacritics and punctuation, and collapses whitespace.
 * Used for stable comparisons between Viu titles and TMDB titles.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalize(value) {
  let text = String(value === null || value === undefined ? '' : value).toLowerCase();

  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (error) {
    // Older QuickJS builds may not implement String.prototype.normalize.
  }

  text = text.replace(/&/g, ' and ').replace(/['`\u2019]/g, '');
  return text.replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
