import Constants from 'expo-constants';
import { Platform } from 'react-native';

type RequireNativeModule = (name: string) => unknown;

function getRequireNativeModule(): RequireNativeModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as { requireNativeModule?: RequireNativeModule };
    return core.requireNativeModule ?? null;
  } catch {
    return null;
  }
}

/** Safe probe — never imports optional Expo native packages. */
export function probeExpoNativeModule(moduleName: string): boolean {
  if (Platform.OS === 'web') return false;
  const requireNativeModule = getRequireNativeModule();
  if (!requireNativeModule) return false;
  try {
    requireNativeModule(moduleName);
    return true;
  } catch {
    return false;
  }
}

const moduleCache = new Map<string, boolean>();

export function isExpoNativeModuleAvailable(moduleName: string): boolean {
  const cached = moduleCache.get(moduleName);
  if (cached != null) return cached;
  const available = probeExpoNativeModule(moduleName);
  moduleCache.set(moduleName, available);
  return available;
}

export function isExpoCameraNativeAvailable(): boolean {
  return isExpoNativeModuleAvailable('ExpoCamera');
}

export function isVideoThumbnailsNativeAvailable(): boolean {
  // Module name differs across SDK versions / runtimes — probe both.
  return (
    isExpoNativeModuleAvailable('ExpoVideoThumbnails') ||
    isExpoNativeModuleAvailable('VideoThumbnails')
  );
}

/** Running inside Expo Go (no custom dev-client native modules). */
export function isExpoGoClient(): boolean {
  return Constants.appOwnership === 'expo';
}
