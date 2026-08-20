import type { OverlayTransform } from './overlay';

export type OverlayFontKey = 'classic' | 'kanit' | 'mitr' | 'halloween';

export type OverlayTextStyle = {
  color: string;
  fontKey: OverlayFontKey;
  italic?: boolean;
};

/** Normalized overlay text — export-ready for bake / publish */
export type OverlayTextState = {
  text: string;
  transform: OverlayTransform;
  style: OverlayTextStyle;
};

export const OVERLAY_TEXT_COLORS = [
  '#FFFFFF',
  '#FE2C55',
  '#FF6B8A',
  '#25F4EE',
  '#F5A524',
  '#111111',
] as const;

export const OVERLAY_FONTS: Array<{ key: OverlayFontKey; label: string }> = [
  { key: 'halloween', label: 'ฮาโลวีน' },
  { key: 'classic', label: 'Classic' },
  { key: 'kanit', label: 'Kanit' },
  { key: 'mitr', label: 'Mitr' },
];

export function cycleOverlayTextColor(current: string): string {
  const palette = OVERLAY_TEXT_COLORS as readonly string[];
  const index = palette.indexOf(current);
  return palette[(index + 1) % palette.length] ?? palette[0]!;
}
