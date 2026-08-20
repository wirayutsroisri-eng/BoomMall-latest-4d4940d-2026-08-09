export type EditorTab = 'draw' | 'crop' | 'filter' | 'adjust';

export type BrushKind = 'pen' | 'marker' | 'highlighter' | 'eraser';

export type Point = { x: number; y: number };

export type Stroke = {
  id: string;
  color: string;
  width: number;
  kind: BrushKind;
  points: Point[];
};

export type FilterId = 'none' | 'vivid' | 'warm' | 'cool' | 'mono' | 'fade' | 'contrast';

export type AdjustValues = {
  brightness: number;
  contrast: number;
  saturation: number;
};

export const DEFAULT_ADJUST: AdjustValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export const BRUSH_COLORS = [
  '#FFFFFF',
  '#111111',
  '#FE2C55',
  '#25F4EE',
  '#F5A524',
  '#00D68F',
  '#2E8CFF',
  '#A855F7',
] as const;

export const FILTER_PRESETS: Array<{
  id: FilterId;
  label: string;
  /** color matrix overlay hint for preview */
  tint: string | null;
}> = [
  { id: 'none', label: 'ต้นฉบับ', tint: null },
  { id: 'vivid', label: 'สดใส', tint: 'rgba(255,70,90,0.14)' },
  { id: 'warm', label: 'อุ่น', tint: 'rgba(255,150,50,0.2)' },
  { id: 'cool', label: 'เย็น', tint: 'rgba(60,140,255,0.18)' },
  { id: 'mono', label: 'ขาวดำ', tint: 'rgba(0,0,0,0.42)' },
  { id: 'fade', label: 'ฟุ้ง', tint: 'rgba(255,255,255,0.22)' },
  { id: 'contrast', label: 'คม', tint: 'rgba(0,0,0,0.12)' },
];
