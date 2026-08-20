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

/** Fit media inside screen bounds without cropping (letterbox outside). */
export function computeContainMediaSize(
  screenWidth: number,
  screenHeight: number,
  mediaWidth: number,
  mediaHeight: number,
) {
  if (mediaWidth <= 0 || mediaHeight <= 0) {
    return { width: screenWidth, height: screenHeight };
  }

  let width = screenWidth;
  let height = (width * mediaHeight) / mediaWidth;
  if (height > screenHeight) {
    height = screenHeight;
    width = (height * mediaWidth) / mediaHeight;
  }

  return { width, height };
}
