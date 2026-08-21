import type { OverlayTransform } from './overlay';
import type { OverlayFontKey } from './overlayText';

/**
 * ข้อความชิ้นเดียวบนจอ (Text Sticker) — เก็บเป็น Array เพื่อรองรับหลายชิ้น
 * พิกัด normalized 0–1 (x, y) เทียบกับเฟรมสื่อ เพื่อ export ข้ามหน้าจอได้ตรงกัน
 */
export type OverlayTextSticker = {
  /** id เฉพาะสำหรับแก้ไข/ลบ/จัดลำดับ */
  id: string;
  text: string;
  color: string;
  fontKey: OverlayFontKey;
  transform: OverlayTransform;
};

export function createTextStickerId(): string {
  return `txt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeTextSticker(
  partial: Partial<OverlayTextSticker> = {},
): OverlayTextSticker {
  return {
    id: createTextStickerId(),
    text: '',
    color: '#FFFFFF',
    fontKey: 'classic',
    transform: { x: 0.5, y: 0.38, scale: 1, rotation: 0 },
    ...partial,
  };
}
