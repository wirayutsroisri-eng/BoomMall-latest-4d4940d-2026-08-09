/** Font registry key for TikTok-style overlay text */
export type OverlayFontKey =
  | 'system'
  | 'classic'
  | 'kanit'
  | 'mitr'
  | 'prompt'
  | 'sarabun'
  | 'halloween';

export const OVERLAY_TEXT_COLORS = [
  '#FFFFFF',
  '#111111',
  '#FE2C55',
  '#25F4EE',
  '#F5A524',
  '#00D68F',
  '#2E8CFF',
  '#A855F7',
] as const;

export const OVERLAY_TEXT_BACKGROUNDS: Array<{
  key: string | null;
  color: string;
}> = [
  { key: null, color: 'transparent' },
  { key: '#111111', color: '#111111' },
  { key: '#FE2C55', color: '#FE2C55' },
  { key: '#25F4EE', color: '#25F4EE' },
  { key: '#F5A524', color: '#F5A524' },
  { key: '#2E8CFF', color: '#2E8CFF' },
];

export const OVERLAY_FONTS: Array<{ key: OverlayFontKey; label: string }> = [
  { key: 'classic', label: 'คลาสสิก' },
  { key: 'system', label: 'ระบบ' },
  { key: 'kanit', label: 'คานิท' },
  { key: 'mitr', label: 'มิตร' },
  { key: 'prompt', label: 'พรอมต์' },
  { key: 'sarabun', label: 'สารบรรณ' },
  { key: 'halloween', label: 'ฮาโลวีน' },
];
