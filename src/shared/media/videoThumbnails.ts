import { isVideoThumbnailsNativeAvailable } from '@/shared/native/expoNativeModules';

/**
 * Extract a poster frame for a video using expo-video-thumbnails.
 *
 * The package is loaded lazily (never imported at module scope) because
 * `expo-video-thumbnails` calls `requireNativeModule('ExpoVideoThumbnails')`
 * synchronously at module load — when the native binary doesn't include it
 * (Expo Go, stale dev-client build, web) that throws
 * `Cannot find native module 'ExpoVideoThumbnails'` and crashes any module
 * that statically imports this file. We probe availability first and only
 * `require()` the package when the native module is present.
 *
 * Starts at 100ms (not 0) to avoid a black first frame, then falls back to
 * later keyframe offsets for videos with delayed first keyframes.
 * Returns null (never throws) so callers can fall back to the video URI.
 */
export async function generateVideoThumbnail(videoUri: string): Promise<string | null> {
  if (!videoUri) {
    console.log('[videoThumbnails] empty videoUri — skip');
    return null;
  }

  if (!isVideoThumbnailsNativeAvailable()) {
    console.warn('[videoThumbnails] ExpoVideoThumbnails native module unavailable — skipping');
    return null;
  }

  let thumbnails: typeof import('expo-video-thumbnails') | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    thumbnails = require('expo-video-thumbnails');
  } catch (e) {
    console.warn('[videoThumbnails] failed to load expo-video-thumbnails', e);
    return null;
  }

  if (!thumbnails?.getThumbnailAsync) {
    console.warn('[videoThumbnails] getThumbnailAsync missing — cannot extract poster');
    return null;
  }

  // Starts at 100ms (not 0) to avoid a black first frame, then falls back to
  // later keyframe offsets for videos with delayed first keyframes.
  for (const time of [100, 500, 1500]) {
    try {
      console.log(`[videoThumbnails] getThumbnailAsync(${videoUri}, time=${time})`);
      const { uri } = await thumbnails.getThumbnailAsync(videoUri, {
        time,
        quality: 0.8,
      });
      if (uri) {
        console.log(`[videoThumbnails] thumbnail ok at time=${time}: ${uri}`);
        return uri;
      }
    } catch (e) {
      console.error(`[videoThumbnails] getThumbnailAsync failed at time=${time}`, e);
    }
  }
  return null;
}
