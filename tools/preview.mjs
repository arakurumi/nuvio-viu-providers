import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const args = process.argv.slice(2);
const positional = [];
const flags = {};

for (let index = 0; index < args.length; index += 1) {
	const arg = args[index];
	if (arg === "--json") {
		flags.json = true;
	} else if (arg === "--cookie") {
		flags.cookie = args[index + 1];
		index += 1;
	} else if (arg === "--lang") {
		flags.language = args[index + 1];
		index += 1;
	} else {
		positional.push(arg);
	}
}

const [contentId, mediaType = "tv", seasonArg, episodeArg] = positional;

if (!contentId) {
	console.error(
		"Usage: npm run preview -- <content-id> [movie|tv] [season] [episode] [--json] [--cookie <file>] [--lang id|en]",
	);
	console.error("Example: npm run preview -- 286794 tv 1 1");
	process.exit(1);
}

async function loadCookie() {
	if (flags.cookie) return readFile(flags.cookie, "utf8");
	if (process.env.VIU_COOKIE) return process.env.VIU_COOKIE;

	const local = new URL("../cookies.txt", import.meta.url);
	if (existsSync(local)) return readFile(local, "utf8");
	return "";
}

const cookie = await loadCookie();
if (!cookie.trim()) {
	console.warn(
		"No cookie found. Pass --cookie <file>, set VIU_COOKIE, or create cookies.txt.",
	);
}

const code = await readFile(
	new URL("../providers/viu.js", import.meta.url),
	"utf8",
);

const season =
	seasonArg === undefined || seasonArg === "null" ? null : Number(seasonArg);
const episode =
	episodeArg === undefined || episodeArg === "null" ? null : Number(episodeArg);

// Nuvio exposes a browser-like fetch and forwards console output to logcat.
const sandbox = {
	atob,
	btoa,
	clearTimeout,
	console,
	fetch,
	setTimeout,
	TextDecoder,
	TextEncoder,
	URL,
};

// Nuvio wraps the bundle like this and reads module.exports.getStreams.
const pluginModule = { exports: {} };
sandbox.module = pluginModule;
sandbox.exports = pluginModule.exports;

// Nuvio injects its own key; set TMDB_API_KEY in the environment to mirror it.
if (process.env.TMDB_API_KEY) sandbox.TMDB_API_KEY = process.env.TMDB_API_KEY;

sandbox.SCRAPER_SETTINGS = {
	cookie,
	includeSubtitles: true,
	language: flags.language || "id",
};

vm.createContext(sandbox);
vm.runInContext(`(function () {\n${code}\n})();`, sandbox, {
	filename: "viu.js",
});

const getStreams = pluginModule.exports.getStreams || sandbox.getStreams;
if (typeof getStreams !== "function") {
	console.error("Provider did not export getStreams.");
	process.exit(1);
}

if (typeof pluginModule.exports.onSettings === "function") {
	const layout = await pluginModule.exports.onSettings();
	console.log(`Settings: ${layout.length} field(s)`);
}

const started = Date.now();
const streams = await getStreams(contentId, mediaType, season, episode);

console.log(`\nviu: ${streams.length} stream(s) in ${Date.now() - started}ms`);
for (const stream of streams) {
	const subtitles = Array.isArray(stream.subtitles)
		? stream.subtitles.length
		: 0;
	const suffix = subtitles ? ` | ${subtitles} sub(s)` : "";
	console.log(
		`- ${stream.quality} | ${stream.type} | ${stream.title}${suffix}`,
	);
	console.log(`  ${String(stream.url).slice(0, 110)}`);
}

if (flags.json) console.log(JSON.stringify(streams, null, 2));
