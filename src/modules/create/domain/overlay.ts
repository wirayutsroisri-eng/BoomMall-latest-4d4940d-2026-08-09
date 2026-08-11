/** Normalized overlay transform — (0.5, 0.5) = กลางจอ ใช้ล็อกตำแหน่งข้ามทุกหน้า */
export type OverlayTransform = {
  /** 0–1 จากซ้ายของเฟรม */
  x: number;
  /** 0–1 จากบนของเฟรม */
  y: number;
  scale: number;
  /** radians */
  rotation: number;
};

export const DEFAULT_OVERLAY_TRANSFORM: OverlayTransform = {
  x: 0.5,
  y: 0.38,
  scale: 1,
  rotation: 0,
};

export function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
