/** Settings UI read by Nuvio when the provider declares `hasSettings`. */
const SETTINGS_LAYOUT = [
	{ label: "Viu account", type: "header" },
	{
		description:
			"Paste the Cookie header from viu.com (or the contents of cookies.txt). The token cookie authenticates playback; premium titles need a premium account.",
		label: "Premium cookie required",
		type: "info",
	},
	{
		description: "Example: token=...; user_id=...; user_level=2",
		isPassword: true,
		key: "cookie",
		label: "Cookie",
		placeholder: "token=...; user_id=...",
		type: "text",
	},
	{
		defaultValue: "id",
		key: "language",
		label: "Metadata language",
		options: [
			{ label: "Bahasa Indonesia", value: "id" },
			{ label: "English", value: "en" },
		],
		type: "select",
	},
	{
		defaultValue: true,
		description: "Attach Viu subtitle tracks to each stream (Mobile only).",
		key: "includeSubtitles",
		label: "Include Viu subtitles",
		type: "toggle",
	},
];

/**
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function onSettings() {
	return SETTINGS_LAYOUT;
}
