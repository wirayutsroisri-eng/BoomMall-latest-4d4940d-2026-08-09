import {
  isExpoCameraNativeAvailable,
  isExpoGoClient,
} from '@/shared/native/expoNativeModules';

export { isExpoCameraNativeAvailable as isLiveCameraNativeAvailable };

export type LiveCameraModule = typeof import('../ui/CreateCaptureLiveCamera');

let cachedModule: LiveCameraModule | null | undefined;

/** Lazy-load live camera UI only when ExpoCamera native module exists. */
export function loadLiveCameraModule(): LiveCameraModule | null {
  if (!isExpoCameraNativeAvailable()) return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('../ui/CreateCaptureLiveCamera') as LiveCameraModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** True when preview must fall back to ImagePicker / placeholder (Expo Go without module). */
export function shouldUseCaptureCameraFallback(): boolean {
  return !isExpoCameraNativeAvailable();
}

export function captureFallbackReason(): string | null {
  if (isExpoCameraNativeAvailable()) return null;
  if (isExpoGoClient()) {
    return 'Expo Go — กดชัตเตอร์เพื่อเปิดกล้องระบบ หรือเลือกจากอัลบั้ม';
  }
  return 'กล้องสดไม่พร้อม — กดชัตเตอร์เพื่อเปิดกล้องระบบ';
}
