import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export type CameraPreviewMode = 'photo' | 'video15' | 'video60';

/** Portrait preview box that fits on screen without cropping (letterboxed). */
export function computeCameraPreviewSize(
  screenWidth: number,
  screenHeight: number,
  mode: CameraPreviewMode,
) {
  const video = mode !== 'photo';
  const widthRatio = video ? 9 : 3;
  const heightRatio = video ? 16 : 4;

  let width = screenWidth;
  let height = (width * heightRatio) / widthRatio;
  if (height > screenHeight) {
    height = screenHeight;
    width = (height * widthRatio) / heightRatio;
  }

  return { width, height };
}

export function useCameraPreviewLayout(mode: CameraPreviewMode) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  return useMemo(
    () => computeCameraPreviewSize(screenWidth, screenHeight, mode),
    [mode, screenHeight, screenWidth],
  );
}

export function cameraPreviewRatioProp(mode: CameraPreviewMode): '4:3' | '16:9' {
  return mode === 'photo' ? '4:3' : '16:9';
}

/**
 * Fit media inside screen bounds without cropping (letterbox outside).
 * Only downscales when media is larger than the viewport — never upscales,
 * so small videos stay at their original size and are never zoomed/pixelated.
 * ใช้กับ Feed ที่ต้องการแสดงวิดีโอขนาดออริจินัล (ไม่ซูม)
 */
export function computeContainMediaSize(
  screenWidth: number,
  screenHeight: number,
  mediaWidth: number,
  mediaHeight: number,
) {
  if (mediaWidth <= 0 || mediaHeight <= 0) {
    return { width: screenWidth, height: screenHeight };
  }

  const scale = Math.min(
    1, // never upscale — keep original size
    screenWidth / mediaWidth,
    screenHeight / mediaHeight,
  );

  return {
    width: Math.round(mediaWidth * scale),
    height: Math.round(mediaHeight * scale),
  };
}

/**
 * Full-viewport layout for videos — no dimension calculation.
 *
 * Videos shot on mobile cameras may embed EXIF Rotation (e.g. 90°).
 * Reading raw width/height without accounting for rotation produces
 * swapped dimensions, which causes the video to render tiny in the
 * center. Instead of calculating, we let the native player
 * (VideoView + contentFit="contain") handle aspect ratio and rotation.
 *
 * Use this for all video types instead of computeContainMediaSize /
 * computeContainMediaSizeFill.
 */
export const VIDEO_FULLSCREEN_LAYOUT = {
  width: '100%' as const,
  height: '100%' as const,
};

/**
 * Fit media inside screen bounds without cropping (letterbox outside).
 * Always scales to fill the available space — both upscaling and downscaling.
 * This ensures previews fill the viewport regardless of source resolution.
 * ใช้กับ Create/Preview ที่ต้องการให้สื่อเต็ม container เสมอ
 *
 * ⚠️ Do NOT call this for videos — use VIDEO_FULLSCREEN_LAYOUT instead.
 *    Raw video pixel dimensions may be swapped due to EXIF rotation,
 *    producing a tiny centered preview.
 */
export function computeContainMediaSizeFill(
  screenWidth: number,
  screenHeight: number,
  mediaWidth: number,
  mediaHeight: number,
) {
  if (mediaWidth <= 0 || mediaHeight <= 0) {
    return { width: screenWidth, height: screenHeight };
  }

  const scale = Math.min(
    screenWidth / mediaWidth,
    screenHeight / mediaHeight,
  );

  return {
    width: Math.round(mediaWidth * scale),
    height: Math.round(mediaHeight * scale),
  };
}
