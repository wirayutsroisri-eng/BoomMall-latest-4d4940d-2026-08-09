/**
 * Compute the "contain" fit size of an image inside a container while keeping
 * the aspect ratio. Returns the largest size that fits entirely within the
 * container bounds.
 */
export function computeContainMediaSize(
  containerW: number,
  containerH: number,
  iw: number,
  ih: number,
): { width: number; height: number } {
  if (containerW <= 0 || containerH <= 0 || iw <= 0 || ih <= 0) {
    return { width: containerW, height: containerH };
  }
  const scale = Math.min(containerW / iw, containerH / ih);
  return {
    width: Math.round(iw * scale),
    height: Math.round(ih * scale),
  };
}
