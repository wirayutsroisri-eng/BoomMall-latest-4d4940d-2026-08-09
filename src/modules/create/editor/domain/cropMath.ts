export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AspectPreset = 'original' | 'free' | '3:4' | '9:16' | '1:1' | '4:3';

export function aspectValue(preset: AspectPreset, imageRatio: number): number | null {
  switch (preset) {
    case 'original':
      return imageRatio;
    case 'free':
      return null;
    case '3:4':
      return 3 / 4;
    case '9:16':
      return 9 / 16;
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    default:
      return null;
  }
}

/** วางครอปตรงกลางให้ใหญ่สุดตามอัตราส่วน */
export function centeredCrop(
  frameW: number,
  frameH: number,
  ratio: number | null,
  inset = 0.06,
): CropRect {
  const maxW = frameW * (1 - inset * 2);
  const maxH = frameH * (1 - inset * 2);
  let width = maxW;
  let height = maxH;
  if (ratio != null && ratio > 0) {
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
  }
  return {
    x: (frameW - width) / 2,
    y: (frameH - height) / 2,
    width,
    height,
  };
}

export function clampCrop(
  crop: CropRect,
  frameW: number,
  frameH: number,
  minSize = 64,
): CropRect {
  let { x, y, width, height } = crop;
  width = Math.min(frameW, Math.max(minSize, width));
  height = Math.min(frameH, Math.max(minSize, height));
  x = Math.min(frameW - width, Math.max(0, x));
  y = Math.min(frameH - height, Math.max(0, y));
  return { x, y, width, height };
}

/** แปลงครอปจากพิกัดบนจอ → พิกเซลรูปจริง (ภาพ cover/contain ในเฟรม) */
export function cropToImagePixels(
  crop: CropRect,
  frameW: number,
  frameH: number,
  imageW: number,
  imageH: number,
): CropRect {
  const scale = Math.min(frameW / imageW, frameH / imageH);
  const drawW = imageW * scale;
  const drawH = imageH * scale;
  const ox = (frameW - drawW) / 2;
  const oy = (frameH - drawH) / 2;

  const relX = Math.max(0, crop.x - ox);
  const relY = Math.max(0, crop.y - oy);
  const relR = Math.min(drawW, crop.x + crop.width - ox);
  const relB = Math.min(drawH, crop.y + crop.height - oy);

  const left = Math.round((relX / drawW) * imageW);
  const top = Math.round((relY / drawH) * imageH);
  const right = Math.round((relR / drawW) * imageW);
  const bottom = Math.round((relB / drawH) * imageH);

  return {
    x: Math.max(0, left),
    y: Math.max(0, top),
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
