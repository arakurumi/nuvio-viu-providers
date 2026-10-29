import { VIU } from './config.js';
import { buildRequestHeaders } from './session.js';

/**
 * @param {unknown} payload
 * @returns {boolean}
 */
function isSuccess(payload) {
  if (!payload || !payload.status) return false;
  const status = payload.status;
  if (typeof status === 'number') return status === 0;
  return status.code === 0;
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function messageOf(payload) {
  if (!payload || !payload.status) return 'unknown error';
  const status = payload.status;
  if (typeof status === 'number') return `status ${status}`;
  return `${status.message || 'error'} (${status.code})`;
}

/**
 * @param {Record<string, any>} params
 * @returns {string}
 */
function serialize(params) {
  const parts = [];
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === null || value === undefined || value === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });
  return parts.join('&');
}

/**
 * Client for the Viu gateway the web app uses.
 *
 * `mobile` routes live under `/api/mobile?r=/route` (search, detail, product
 * list) while playback lives under `/api/playback/distribute`.
 *
 * @param {object} options
 * @param {ReturnType<import('../shared/http.js').createHttpClient>} options.http
 * @param {ReturnType<import('../shared/log.js').createLogger>} options.log
 * @param {ReturnType<import('./session.js').createSession>} options.session
 */
export function createViuClient({ http, log, session }) {
  const headers = buildRequestHeaders(session);

  function baseQuery() {
    return {
      platform_flag_label: 'web',
      area_id: session.areaId,
      language_flag_id: session.languageFlagId,
      ut: session.userLevel,
      platformFlagLabel: 'web',
      areaId: session.areaId,
      languageFlagId: session.languageFlagId,
      countryCode: session.countryCode,
    };
  }

  /**
   * @param {string} route
   * @param {Record<string, any>} params
   * @param {boolean} mobile
   * @returns {Promise<any|null>} The `data` block, or null on failure.
   */
  async function request(route, params, mobile) {
    const query = Object.assign(mobile ? { r: route } : {}, baseQuery(), params || {});
    const url = mobile
      ? `${VIU.apiBase}/mobile?${serialize(query)}`
      : `${VIU.apiBase}${route}?${serialize(query)}`;

    const payload = await http.json(url, { headers });
    if (!payload || !isSuccess(payload)) {
      if (payload) log.warn(`${route} failed: ${messageOf(payload)}`);
      return null;
    }

    return payload.data || null;
  }

  /**
   * @param {string} keyword
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async function search(keyword) {
    const data = await request(
      '/search/video',
      { keyword, page: '1', size: String(VIU.searchPageSize), os_flag_id: '1' },
      true
    );
    return (data && data.series) || [];
  }

  /**
   * @param {string|number} productId
   * @returns {Promise<Record<string, any>|null>}
   */
  async function getDetail(productId) {
    return request('/vod/detail', { product_id: String(productId), os_flag_id: '1' }, true);
  }

  /**
   * @param {string|number} seriesId
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async function getProducts(seriesId) {
    if (!seriesId) return [];
    const data = await request(
      '/vod/product-list',
      { series_id: String(seriesId), sort: 'asc', size: '-1', os_flag_id: '1' },
      true
    );
    return (data && data.product_list) || [];
  }

  /**
   * @param {string|number} ccsProductId
   * @returns {Promise<Record<string, any>|null>} The playback stream block.
   */
  async function getPlayback(ccsProductId) {
    const data = await request(
      '/playback/distribute',
      { ccs_product_id: String(ccsProductId), language_flag_id: session.languageFlagId },
      false
    );
    return (data && data.stream) || null;
  }

  return { search, getDetail, getProducts, getPlayback };
}
