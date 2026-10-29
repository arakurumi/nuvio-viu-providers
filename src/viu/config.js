/**
 * Viu Indonesia configuration.
 *
 * Endpoints below are the ones used directly by the Viu web app
 * (www.viu.com/ott/id). No third-party streaming API is involved.
 * TMDB is only used to turn a content id into a title.
 */
export const VIU = {
	acceptLanguage: "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
	apiBase: "https://api-gateway-global.viu.com/api",
	baseUrl: "https://www.viu.com",
	/** Keep the whole provider within the 60 s plugin budget (30 s per request on TV). */
	budgetMs: 55000,
	label: "Viu",
	locale: "id",
	maxSearchQueries: 3,
	maxStreams: 8,
	providerId: "viu",
	searchPageSize: 20,
	/** Alternative title countries from TMDB, searched in this order. */
	titleCountryPriority: ["ID", "US", "GB"],
	userAgent:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

export const REGION = {
	areaId: "1000",
	countryCode: "ID",
};

/** Viu language flag ids for the ID region. */
export const LANGUAGES = {
	en: { flag: "3", label: "English" },
	id: { flag: "8", label: "Bahasa Indonesia" },
};

/** Quality keys returned by /playback/distribute, best first. */
export const QUALITIES = [
	{ key: "s1080p", label: "1080p" },
	{ key: "s720p", label: "720p" },
	{ key: "s480p", label: "480p" },
	{ key: "s240p", label: "240p" },
];
