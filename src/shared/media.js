/**
 * Normalizes a stream label into the compact text Nuvio displays.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function streamTitle(value) {
	return String(value === null || value === undefined ? "" : value)
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 120);
}

/**
 * Builds a Nuvio stream object.
 *
 * @param {object} options
 * @param {string} options.name Provider name shown in Nuvio.
 * @param {string} options.provider Stable provider id.
 * @param {string} options.title
 * @param {string} options.url
 * @param {string} [options.quality]
 * @param {string} [options.type]
 * @param {string} [options.language]
 * @param {string} [options.referer]
 * @param {string} [options.origin]
 * @param {string} [options.size] Human readable file size, when the source reports one.
 * @param {Array<{ url: string, language: string, name?: string, headers?: Record<string, string> }>} [options.subtitles]
 * @param {string} options.userAgent
 * @returns {Record<string, any>}
 */
export function buildStream({
	name,
	provider,
	title,
	url,
	quality,
	type,
	language,
	referer,
	origin,
	size,
	subtitles,
	userAgent,
}) {
	const headers = { "User-Agent": userAgent };
	if (referer) headers.Referer = referer;
	if (origin) headers.Origin = origin;

	const stream = {
		headers,
		language,
		name,
		provider,
		quality: quality || "HD",
		title: streamTitle(title),
		type,
		url,
	};

	if (size) stream.size = size;
	if (Array.isArray(subtitles) && subtitles.length)
		stream.subtitles = subtitles;

	return stream;
}
