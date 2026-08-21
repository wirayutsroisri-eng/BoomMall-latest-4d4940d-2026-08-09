import type { OverlayTransform } from './overlay';
import type { OverlayFontKey } from './overlayText';
import type { OverlayTextSticker } from './overlayTextSticker';

export type EditorMediaType = 'image' | 'video';

/** Immutable source media. Visual decorations live in `OverlayObject[]`. */
export type EditorMedia = {
  id: string;
  /** Present after upload; drafts continue to use the stable local `id`. */
  mediaAssetId?: string;
  uri: string;
  type: EditorMediaType;
  width?: number;
  height?: number;
  edits?: {
    filter?: string;
  };
};

type OverlayBase = {
  id: string;
  mediaId: string;
  transform: OverlayTransform;
};

export type TextOverlayObject = OverlayBase & {
  type: 'text';
  text: string;
  /** Editor-only interaction guard. Missing means unlocked for legacy posts. */
  locked?: boolean;
  style: {
    color: string;
    fontKey: OverlayFontKey;
    fontFamily?: string;
    /** Font size normalized to media width (0–1), not screen pixels. */
    fontSize?: number;
    fontWeight?: '400' | '500' | '600' | '700' | '800' | '900';
    fontStyle?: 'normal' | 'italic';
    letterSpacing?: number;
    preset?: TextOverlayPresetKey;
    backgroundColor?: string;
    backgroundOpacity?: number;
    strokeColor?: string;
    strokeWidth?: number;
    alignment?: 'left' | 'center' | 'right';
  };
};

export type TextOverlayPresetKey = 'default' | 'bold' | 'soft' | 'italic' | 'display';

export const TEXT_OVERLAY_COLORS = [
  '#FFFFFF', '#111111', '#FE2C55', '#FFD60A', '#34C759',
  '#25F4EE', '#0A84FF', '#AF52DE', '#FF6BBA',
] as const;

export const TEXT_BACKGROUND_OPACITIES = [0, 0.25, 0.5, 0.75, 1] as const;
export const TEXT_BACKGROUND_COLORS = [
  'transparent', '#000000', '#FFFFFF', '#FE2C55', '#FFD60A',
  '#34C759', '#25F4EE', '#0A84FF', '#AF52DE', '#FF6BBA',
] as const;
export const TEXT_STROKE_OPTIONS = [
  { color: 'transparent', width: 0, label: 'ไม่มี' },
  { color: '#000000', width: 2, label: 'ดำ' },
  { color: '#FFFFFF', width: 2, label: 'ขาว' },
] as const;

export const TEXT_STYLE_PRESETS: readonly {
  key: TextOverlayPresetKey;
  label: string;
  fontWeight: TextOverlayObject['style']['fontWeight'];
  fontStyle: TextOverlayObject['style']['fontStyle'];
  letterSpacing: number;
}[] = [
  { key: 'default', label: 'Default', fontWeight: '700', fontStyle: 'normal', letterSpacing: 0 },
  { key: 'bold', label: 'Bold', fontWeight: '900', fontStyle: 'normal', letterSpacing: 0 },
  { key: 'soft', label: 'Soft', fontWeight: '500', fontStyle: 'normal', letterSpacing: 0 },
  { key: 'italic', label: 'Italic', fontWeight: '700', fontStyle: 'italic', letterSpacing: 0 },
  { key: 'display', label: 'Display', fontWeight: '900', fontStyle: 'normal', letterSpacing: 1.2 },
] as const;

function nextCycleValue<T>(values: readonly T[], current: T): T {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length] ?? values[0]!;
}

export function nextTextOverlayColor(current: string): string {
  return nextCycleValue(TEXT_OVERLAY_COLORS, current);
}

export function nextTextBackgroundColor(current: string | undefined): string {
  return nextCycleValue(TEXT_BACKGROUND_COLORS, current ?? 'transparent');
}

export function nextTextStroke(style: TextOverlayObject['style']) {
  const currentIndex = TEXT_STROKE_OPTIONS.findIndex((option) =>
    option.width === (style.strokeWidth ?? 0) && option.color === (style.strokeColor ?? 'transparent'),
  );
  return TEXT_STROKE_OPTIONS[(currentIndex + 1) % TEXT_STROKE_OPTIONS.length] ?? TEXT_STROKE_OPTIONS[0]!;
}

export function currentTextBackgroundOpacity(style: TextOverlayObject['style']): number {
  return style.backgroundOpacity ?? (style.backgroundColor === 'transparent' ? 0 : 1);
}

export function nextTextBackgroundOpacity(style: TextOverlayObject['style']): number {
  const current = currentTextBackgroundOpacity(style);
  return nextCycleValue(TEXT_BACKGROUND_OPACITIES, current as typeof TEXT_BACKGROUND_OPACITIES[number]);
}

export function nextTextStylePreset(style: TextOverlayObject['style']) {
  const currentIndex = TEXT_STYLE_PRESETS.findIndex((preset) => preset.key === style.preset);
  return TEXT_STYLE_PRESETS[(currentIndex + 1) % TEXT_STYLE_PRESETS.length] ?? TEXT_STYLE_PRESETS[0]!;
}

export const DEFAULT_TEXT_OVERLAY_STYLE: TextOverlayObject['style'] = {
  color: '#FFFFFF',
  fontKey: 'classic',
  fontSize: 36 / 390,
  fontWeight: '900',
  fontStyle: 'normal',
  letterSpacing: 0,
  preset: 'default',
  backgroundColor: 'rgba(0,0,0,0.22)',
  backgroundOpacity: 1,
  strokeColor: '#000000',
  strokeWidth: 2,
  alignment: 'center',
};

/** Defaults only for newly created overlays; legacy defaults above must remain stable. */
export const NEW_TEXT_OVERLAY_STYLE: TextOverlayObject['style'] = {
  ...DEFAULT_TEXT_OVERLAY_STYLE,
  preset: 'default',
  fontWeight: '700',
  fontStyle: 'normal',
  letterSpacing: 0,
  backgroundColor: 'transparent',
  backgroundOpacity: 0,
  strokeColor: 'transparent',
  strokeWidth: 0,
};

export type StickerOverlayObject = OverlayBase & {
  type: 'sticker';
  sticker: string;
  style?: { opacity?: number };
};

export type OverlayObject = TextOverlayObject | StickerOverlayObject;

export function createEditorMediaId(): string {
  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeEditorMedia(uri: string, type: EditorMediaType, id = createEditorMediaId()): EditorMedia {
  return { id, uri, type };
}

export function textStickerToOverlay(sticker: OverlayTextSticker, mediaId: string): TextOverlayObject {
  return {
    id: sticker.id,
    mediaId,
    type: 'text',
    text: sticker.text,
    locked: false,
    transform: sticker.transform,
    style: { ...DEFAULT_TEXT_OVERLAY_STYLE, color: sticker.color, fontKey: sticker.fontKey },
  };
}

export function textOverlayToSticker(overlay: TextOverlayObject): OverlayTextSticker {
  return {
    id: overlay.id,
    text: overlay.text,
    color: overlay.style.color,
    fontKey: overlay.style.fontKey,
    transform: overlay.transform,
  };
}

export function textOverlaysForMedia(overlays: OverlayObject[], mediaId?: string | null): OverlayTextSticker[] {
  if (!mediaId) return [];
  return overlays
    .filter((overlay): overlay is TextOverlayObject => overlay.type === 'text' && overlay.mediaId === mediaId)
    .map(textOverlayToSticker);
}

export function replaceTextOverlaysForMedia(
  overlays: OverlayObject[],
  mediaId: string,
  stickers: OverlayTextSticker[],
): OverlayObject[] {
  return [
    ...overlays.filter((overlay) => !(overlay.type === 'text' && overlay.mediaId === mediaId)),
    ...stickers.map((sticker) => textStickerToOverlay(sticker, mediaId)),
  ];
}

export function legacyTextOverlaysForMedia(input: {
  mediaId: string;
  stickers?: (Omit<OverlayTextSticker, 'fontKey'> & { fontKey: string })[];
  text?: string;
  color?: string;
  fontKey?: OverlayFontKey;
  transform?: OverlayTransform;
}): TextOverlayObject[] {
  if (input.stickers?.length) {
    return input.stickers.map((sticker) => textStickerToOverlay({
      ...sticker,
      fontKey:
        sticker.fontKey === 'kanit' || sticker.fontKey === 'mitr' || sticker.fontKey === 'halloween'
          ? sticker.fontKey
          : 'classic',
    }, input.mediaId));
  }
  if (!input.text?.trim() || !input.transform) return [];
  return [{
    id: `legacy-text-${input.mediaId}`,
    mediaId: input.mediaId,
    type: 'text',
    text: input.text,
    transform: input.transform,
    style: {
      ...DEFAULT_TEXT_OVERLAY_STYLE,
      color: input.color || DEFAULT_TEXT_OVERLAY_STYLE.color,
      fontKey: input.fontKey || DEFAULT_TEXT_OVERLAY_STYLE.fontKey,
    },
  }];
}
