import { Easing, type WithSpringConfig } from 'react-native-reanimated';

/** Spring แบบ interactive dismiss ของ iOS — แน่น ไม่เด้งเกิน */
export const IOS_SPRING: WithSpringConfig = {
  damping: 28,
  stiffness: 340,
  mass: 0.82,
  overshootClamping: true,
  energyThreshold: 6e-3,
};

/**
 * Spring สำหรับปัดข้ามแท็บฟีด — นุ่ม ลื่น ไหลตามนิ้ว ไม่ปุ๊บปั๊บ
 * ลด stiffness + เพิ่ม damping + ปล่อยให้มี overshoot เล็กน้อยตามธรรมชาติ
 * เพื่อให้การ snap กลับตำแหน่งรู้สึกต่อเนื่องเหมือน UIScrollView ของ iOS
 */
export const PAGER_SPRING: WithSpringConfig = {
  damping: 22,
  stiffness: 190,
  mass: 1,
  overshootClamping: false,
  energyThreshold: 4e-3,
};


/** Curve ใกล้ UIView animation push/pop */
export const IOS_PUSH = {
  duration: 300,
  easing: Easing.bezier(0.32, 0.72, 0, 1),
};

/** ยางยืดขอบจอแบบ UIScrollView */
export function rubberBand(offset: number, dimension: number, coeff = 0.55): number {
  'worklet';
  if (offset === 0 || dimension <= 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const x = Math.abs(offset);
  return sign * (1 - 1 / ((x * coeff) / dimension + 1)) * dimension;
}

/** ตำแหน่งแถบแท็บ (0 … -(pages-1)*width) พร้อมยางยืดขอบ */
export function clampPagerX(x: number, pageWidth: number, pageCount: number): number {
  'worklet';
  const min = -((pageCount - 1) * pageWidth);
  const max = 0;
  if (x > max) return max + rubberBand(x - max, pageWidth, 0.5);
  if (x < min) return min - rubberBand(min - x, pageWidth, 0.5);
  return x;
}

export function snapPagerIndex(x: number, pageWidth: number, pageCount: number, velocityX = 0): number {
  'worklet';
  const projected = x + velocityX * 0.16;
  const raw = Math.round(-projected / pageWidth);
  return Math.max(0, Math.min(pageCount - 1, raw));
}
