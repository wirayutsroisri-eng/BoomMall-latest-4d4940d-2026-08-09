import type { AdjustValues, FilterId } from './types';

/** 4x5 color matrix helpers for Skia ColorMatrix */
function identity(): number[] {
  return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array(20).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      out[row * 5 + col] =
        a[row * 5] * b[col] +
        a[row * 5 + 1] * b[5 + col] +
        a[row * 5 + 2] * b[10 + col] +
        a[row * 5 + 3] * b[15 + col] +
        (col === 4 ? a[row * 5 + 4] : 0);
    }
  }
  return out;
}

function brightnessMatrix(v: number): number[] {
  // v: -1..1 → add to RGB
  const t = v * 0.45;
  return [1, 0, 0, 0, t, 0, 1, 0, 0, t, 0, 0, 1, 0, t, 0, 0, 0, 1, 0];
}

function contrastMatrix(v: number): number[] {
  const c = 1 + v;
  const t = (1 - c) / 2;
  return [c, 0, 0, 0, t, 0, c, 0, 0, t, 0, 0, c, 0, t, 0, 0, 0, 1, 0];
}

function saturationMatrix(v: number): number[] {
  const s = 1 + v;
  const inv = 1 - s;
  const r = 0.2126 * inv;
  const g = 0.7152 * inv;
  const b = 0.0722 * inv;
  return [
    r + s,
    g,
    b,
    0,
    0,
    r,
    g + s,
    b,
    0,
    0,
    r,
    g,
    b + s,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
}

function filterMatrix(id: FilterId): number[] {
  switch (id) {
    case 'mono':
      return [
        0.33, 0.33, 0.33, 0, 0, 0.33, 0.33, 0.33, 0, 0, 0.33, 0.33, 0.33, 0, 0, 0, 0, 0, 1, 0,
      ];
    case 'warm':
      return multiply(saturationMatrix(0.15), brightnessMatrix(0.06));
    case 'cool':
      return [
        0.9, 0, 0.05, 0, 0, 0, 0.95, 0.05, 0, 0, 0.05, 0.05, 1.1, 0, 0, 0, 0, 0, 1, 0,
      ];
    case 'vivid':
      return multiply(saturationMatrix(0.35), contrastMatrix(0.12));
    case 'fade':
      return multiply(contrastMatrix(-0.18), brightnessMatrix(0.08));
    case 'contrast':
      return contrastMatrix(0.28);
    default:
      return identity();
  }
}

export function buildColorMatrix(filter: FilterId, adjust: AdjustValues): number[] {
  let m = filterMatrix(filter);
  if (adjust.brightness !== 0) m = multiply(brightnessMatrix(adjust.brightness), m);
  if (adjust.contrast !== 0) m = multiply(contrastMatrix(adjust.contrast), m);
  if (adjust.saturation !== 0) m = multiply(saturationMatrix(adjust.saturation), m);
  return m;
}
