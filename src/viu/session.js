import { LANGUAGES, REGION, VIU } from "./config.js";

/**
 * Reads the settings Nuvio injects into the plugin sandbox.
 *
 * @returns {Record<string, any>}
 */
export function readSettings() {
	try {
		const settings = globalThis.SCRAPER_SETTINGS;
		return settings && typeof settings === "object" ? settings : {};
	} catch {
		return {};
	}
}

/**
 * Parses a cookie input. Accepts either:
 * - a Cookie header: "token=...; user_id=..."
 * - the contents of a Netscape cookies.txt export
 * - a JSON object of cookie key/value pairs
 *
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function parseCookieInput(raw) {
	const jar = {};
	if (!raw) return jar;

	const text = String(raw).trim();
	if (!text) return jar;

	if (text.charAt(0) === "{") {
		try {
			const parsed = JSON.parse(text);
			Object.keys(parsed).forEach((key) => {
				if (parsed[key] != null) jar[key] = String(parsed[key]);
			});
			if (Object.keys(jar).length) return jar;
		} catch {
			// Fall through to the line based parser.
		}
	}

	const lines = text.split(/\r?\n/);
	for (const line of lines) {
		let value = line.trim();
		if (!value) continue;

		// Netscape exports prefix HttpOnly cookies with #HttpOnly_.
		if (value.indexOf("#HttpOnly_") === 0) {
			value = value.slice("#HttpOnly_".length);
		} else if (value.charAt(0) === "#") {
			continue;
		}

		const parts = value.split("\t");
		if (parts.length >= 7) {
			jar[parts[5]] = parts[6];
			continue;
		}

		const header = value.replace(/^cookie\s*:\s*/i, "");
		for (const pair of header.split(";")) {
			const separator = pair.indexOf("=");
			if (separator <= 0) continue;
			const key = pair.slice(0, separator).trim();
			const cookieValue = pair.slice(separator + 1).trim();
			if (key && cookieValue) jar[key] = cookieValue;
		}
	}

	return jar;
}

/**
 * @param {Record<string, string>} jar
 * @returns {string}
 */
function cookieHeader(jar) {
	return Object.keys(jar)
		.map((key) => `${key}=${jar[key]}`)
		.join("; ");
}

/**
 * Builds the per-call session: account cookies, region and language.
 *
 * @param {Record<string, any>} settings
 * @returns {{ jar: Record<string, string>, token: string, cookieHeader: string, countryCode: string, areaId: string, languageKey: string, languageFlagId: string, userLevel: string }}
 */
export function createSession(settings) {
	const jar = parseCookieInput(settings.cookie);
	const languageKey = LANGUAGES[settings.language] ? settings.language : "id";
	const language = LANGUAGES[languageKey];

	return {
		areaId: String(jar.areaId || REGION.areaId),
		cookieHeader: cookieHeader(jar),
		countryCode: String(jar.countryCode || REGION.countryCode).toUpperCase(),
		jar,
		languageFlagId: language.flag,
		languageKey,
		token: String(jar.token || "").replace(/^Bearer\s+/i, ""),
		userLevel: String(jar.user_level || "0"),
	};
}

/**
 * Headers the Viu web app sends to its own gateway. They are passed per
 * request so the account cookie never reaches any other host.
 *
 * @param {ReturnType<typeof createSession>} session
 * @returns {Record<string, string>}
 */
export function buildRequestHeaders(session) {
	const headers = {
		Accept: "application/json, text/plain, */*",
		"Accept-Language": VIU.acceptLanguage,
		ccode: session.countryCode,
		Origin: VIU.baseUrl,
		Referer: `${VIU.baseUrl}/`,
		"User-Agent": VIU.userAgent,
		"x-client": "browser",
	};

	if (session.cookieHeader) headers.Cookie = session.cookieHeader;
	if (session.token) headers.Authorization = `Bearer ${session.token}`;
	return headers;
}
