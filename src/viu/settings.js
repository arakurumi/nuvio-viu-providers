/** Settings UI read by Nuvio when the provider declares `hasSettings`. */
const SETTINGS_LAYOUT = [
  { type: 'header', label: 'Viu account' },
  {
    type: 'info',
    label: 'Premium cookie required',
    description:
      'Paste the Cookie header from viu.com (or the contents of cookies.txt). The token cookie authenticates playback; premium titles need a premium account.',
  },
  {
    type: 'text',
    key: 'cookie',
    label: 'Cookie',
    description: 'Example: token=...; user_id=...; user_level=2',
    placeholder: 'token=...; user_id=...',
    isPassword: true,
  },
  {
    type: 'select',
    key: 'language',
    label: 'Metadata language',
    defaultValue: 'id',
    options: [
      { label: 'Bahasa Indonesia', value: 'id' },
      { label: 'English', value: 'en' },
    ],
  },
  {
    type: 'toggle',
    key: 'includeSubtitles',
    label: 'Include Viu subtitles',
    defaultValue: true,
    description: 'Attach Viu subtitle tracks to each stream (Mobile only).',
  },
];

/**
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function onSettings() {
  return SETTINGS_LAYOUT;
}
