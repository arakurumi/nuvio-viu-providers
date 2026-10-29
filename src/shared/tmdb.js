import { cleanText } from "./text.js";

const TMDB_API_BASE = "https://api.themoviedb.org/3";
const ID_PREFIX = /^(?:tmdb|movie|series|show)[:/]/i;
const IMDB_ID = /^(?:imdb:)?(tt\d+)$/i;
const TRACKER_ID = /^(mal|anilist|kitsu|anidb|tvdb):/i;

/**
 * Nuvio injects `TMDB_API_KEY` from its own settings (there is always a
 * built-in key). The plugin never ships or hardcodes a third-party key.
 *
 * @returns {string}
 */
export function readTmdbKey() {
	if (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) {
		return String(globalThis.TMDB_API_KEY);
	}
	return "";
}

/**
 * @param {unknown} rawId
 * @returns {{ kind: string, value: string }}
 */
export function parseContentId(rawId) {
	const raw = cleanText(rawId);

	const imdb = raw.match(IMDB_ID);
	if (imdb) return { kind: "imdb", value: imdb[1] };

	const numeric = raw.replace(ID_PREFIX, "");
	if (/^\d+$/.test(numeric)) return { kind: "tmdb", value: numeric };

	return { kind: TRACKER_ID.test(raw) ? "tracker" : "unknown", value: raw };
}

/**
 * Resolves the content id that Nuvio passes into a list of titles.
 *
 * Nuvio only sends an id, so the titles are read from TMDB with the key the
 * app injects. That is the only metadata lookup: Viu's own search, detail and
 * playback API does the rest.
 *
 * @param {object} options
 * @param {string} options.contentId
 * @param {string} options.mediaType
 * @param {ReturnType<import('./http.js').createHttpClient>} options.http
 * @param {ReturnType<import('./log.js').createLogger>} options.log
 * @param {string[]} [options.countryPriority] Alternative title countries, best first.
 * @returns {Promise<{ titles: string[], name: string }>}
 */
export async function resolveTitles({
	contentId,
	mediaType,
	http,
	log,
	countryPriority = [],
}) {
	const parsed = parseContentId(contentId);
	const result = { name: "", titles: [] };

	if (parsed.kind === "tracker") {
		log.warn(
			`Content id "${contentId}" is a tracker id; use a TMDB or IMDb id instead.`,
		);
		return result;
	}

	if (parsed.kind === "unknown") {
		log.warn(`Unsupported content id "${contentId}".`);
		return result;
	}

	const apiKey = readTmdbKey();
	if (!apiKey) {
		log.error("TMDB_API_KEY is not available; Nuvio normally injects it.");
		return result;
	}

	const type = mediaType === "movie" ? "movie" : "tv";
	let tmdbId = parsed.value;

	if (parsed.kind === "imdb") {
		const found = await http.json(
			`${TMDB_API_BASE}/find/${encodeURIComponent(tmdbId)}?api_key=${apiKey}&external_source=imdb_id`,
		);
		const list = found
			? type === "movie"
				? found.movie_results
				: found.tv_results
			: null;
		const first = list?.length ? list[0] : null;

		if (!first?.id) {
			log.warn(`IMDb id ${tmdbId} could not be resolved to a TMDB id.`);
			return result;
		}
		tmdbId = String(first.id);
	}

	const details = await http.json(
		`${TMDB_API_BASE}/${type}/${encodeURIComponent(tmdbId)}` +
			`?api_key=${apiKey}&language=en-US&append_to_response=alternative_titles`,
	);
	if (!details) {
		log.warn(`TMDB details are unavailable for ${tmdbId}.`);
		return result;
	}

	const name = type === "movie" ? details.title : details.name;
	const original =
		type === "movie" ? details.original_title : details.original_name;

	addTitle(result.titles, name);
	addTitle(result.titles, original);

	const block = details.alternative_titles || {};
	const alternatives = type === "movie" ? block.titles : block.results;
	for (const entry of prioritize(alternatives, countryPriority)) {
		if (entry) addTitle(result.titles, entry.title);
	}

	result.name = cleanText(name || original);
	log.debug(`TMDB titles: ${result.titles.slice(0, 4).join(" | ")}`);
	return result;
}

/**
 * @param {string[]} titles
 * @param {unknown} value
 */
function addTitle(titles, value) {
	const text = cleanText(value);
	if (!text) return;

	const key = text.toLowerCase();
	for (const existing of titles) {
		if (existing.toLowerCase() === key) return;
	}
	titles.push(text);
}

/**
 * Sorts alternative titles so the countries closest to the requested catalog
 * are searched first. Unknown countries keep their TMDB order at the end.
 *
 * @param {any[]|undefined} alternatives
 * @param {string[]} priority
 * @returns {any[]}
 */
function prioritize(alternatives, priority) {
	if (!Array.isArray(alternatives)) return [];

	const rank = (entry) => {
		if (!entry) return priority.length + 1;
		const country = String(entry.iso_3166_1 || "").toUpperCase();
		const index = priority.indexOf(country);
		return index === -1 ? priority.length : index;
	};

	return alternatives
		.map((entry, index) => ({ entry, index, rank: rank(entry) }))
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map((item) => item.entry);
}
