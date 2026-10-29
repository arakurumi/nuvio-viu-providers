import { normalize } from "../shared/text.js";
import { VIU } from "./config.js";

const SEASON_PATTERN =
	/\s*(?:[-\u2013\u2014:]\s*)?(?:season|s)\s*(\d{1,2})\s*$/i;
const NUMERIC_SUFFIX = /\s(\d{1,2})$/;
const REJECTED_PREFIX =
	/^(trailer|teaser|preview|clip|featurette|behind the scenes|first look)\b/;
const MIN_SCORE = 820;

/**
 * Splits "Show Season 2" or "Show 2" into a base title and a season number.
 *
 * @param {unknown} raw
 * @param {boolean} allowNumericSeason
 * @returns {{ base: string, normalized: string, season: number|null }}
 */
export function parseTitle(raw, allowNumericSeason) {
	const cleaned = String(raw === null || raw === undefined ? "" : raw)
		.replace(/\s+/g, " ")
		.trim();

	let base = cleaned;
	let season = null;

	const explicit = cleaned.match(SEASON_PATTERN);
	if (explicit) {
		base = cleaned.slice(0, explicit.index).trim();
		season = Number(explicit[1]);
	} else if (allowNumericSeason) {
		const numeric = cleaned.match(NUMERIC_SUFFIX);
		if (numeric) {
			base = cleaned.slice(0, numeric.index).trim();
			season = Number(numeric[1]);
		}
	}

	return { base, normalized: normalize(base), season };
}

/**
 * Viu labels movie categories as "Film ...".
 *
 * @param {Record<string, any>|null|undefined} item
 * @returns {boolean}
 */
export function categoryIsMovie(item) {
	return /^(film|movie)\b/i.test(String(item?.category_name || ""));
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isRejectedTitle(name) {
	const normalized = normalize(name);
	return !normalized || REJECTED_PREFIX.test(normalized);
}

/**
 * Scores a Viu search result against a query title.
 * Exact matches win; partial matches need a long common prefix. Viu's search
 * is loose, so a season suffix is handled separately to avoid playing the
 * wrong season.
 *
 * @param {string} name Site title.
 * @param {string} query Title candidate resolved from the content id.
 * @param {number|null} seasonRequested
 * @param {string} mediaType
 * @returns {number} 0 when the result must be ignored; higher is better.
 */
export function scoreCandidate(name, query, seasonRequested, mediaType) {
	const candidate = parseTitle(name, mediaType === "tv");
	const wanted = parseTitle(query, mediaType === "tv");
	const candidateTitle = candidate.normalized;
	const wantedTitle = wanted.normalized;
	if (!candidateTitle || !wantedTitle) return 0;

	let score = 0;
	if (candidateTitle === wantedTitle) {
		score = 1000;
	} else if (candidateTitle.indexOf(`${wantedTitle} `) === 0) {
		const ratio = wantedTitle.length / candidateTitle.length;
		if (ratio >= 0.78) score = 820;
	}
	if (!score) return 0;

	if (seasonRequested !== null && seasonRequested > 1) {
		if (candidate.season !== null && candidate.season !== seasonRequested) {
			return 0;
		}
		if (candidate.season === null) score = Math.min(score, 860);
	} else if (
		seasonRequested === 1 &&
		candidate.season !== null &&
		candidate.season !== 1
	) {
		return 0;
	}

	return score;
}

/**
 * @param {string[]} titles
 * @param {string} mediaType
 * @param {number|null} season
 * @returns {string[]}
 */
function buildQueries(titles, mediaType, season) {
	const queries = [];

	function add(value) {
		const query = String(value || "").trim();
		if (!query) return;
		const key = query.toLowerCase();
		if (queries.some((entry) => entry.toLowerCase() === key)) return;
		queries.push(query);
	}

	if (mediaType === "tv" && season !== null && season > 1 && titles.length) {
		add(`${titles[0]} Season ${season}`);
	}
	titles.forEach(add);

	return queries.slice(0, VIU.maxSearchQueries);
}

/**
 * Searches Viu and returns the best matching series/product. Results below
 * the threshold are rejected instead of serving the wrong title.
 *
 * @param {object} options
 * @param {string[]} options.titles Candidate titles, best first.
 * @param {string} options.mediaType
 * @param {number|null} options.season
 * @param {(query: string) => Promise<Array<Record<string, any>>>} options.search
 * @param {ReturnType<import('../shared/log.js').createLogger>} options.log
 * @returns {Promise<{ item: Record<string, any>, score: number, query: string, parsed: { base: string, season: number|null } }|null>}
 */
export async function findBestMatch({
	titles,
	mediaType,
	season,
	search,
	log,
}) {
	const queries = buildQueries(titles, mediaType, season);
	let best = null;

	for (const query of queries) {
		const items = await search(query);

		for (const item of items) {
			const name = item?.name;
			if (!name || isRejectedTitle(name)) continue;
			if (mediaType === "tv" && categoryIsMovie(item)) continue;

			let score = scoreCandidate(name, query, season, mediaType);
			if (!score) continue;

			if (categoryIsMovie(item)) score += mediaType === "movie" ? 20 : -20;

			if (!best || score > best.score) {
				best = {
					item,
					parsed: parseTitle(name, mediaType === "tv"),
					query,
					score,
				};
			}
		}

		if (best && best.score >= 900) break;
	}

	if (!best || best.score < MIN_SCORE) {
		log.warn(`No reliable Viu match for ${titles.slice(0, 2).join(" | ")}.`);
		return null;
	}

	log.info(
		`Matched "${best.item.name}" for query "${best.query}" (score ${best.score}).`,
	);
	return best;
}
