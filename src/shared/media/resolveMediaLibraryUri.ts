import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import {
  isVideoThumbnailsNativeAvailable,
} from '@/shared/native/expoNativeModules';

export { isVideoThumbnailsNativeAvailable } from '@/shared/native/expoNativeModules';

const uriCache = new Map<string, string>();
const videoThumbCache = new Map<string, string>();
const VIDEO_THUMB_PLACEHOLDER = '__video_thumb_placeholder__';
const DISPLAY_TIMEOUT_MS = 5000;
const PLAYBACK_TIMEOUT_MS = 30000;

export function isVideoAsset(asset: MediaLibrary.Asset) {
  return asset.mediaType === MediaLibrary.MediaType.video;
}

export function normalizeMediaUri(uri: string): string {
  if (!uri) return uri;
  const hashIdx = uri.indexOf('#');
  if (hashIdx > 0) return uri.slice(0, hashIdx);
  return uri;
}

export function isDirectMediaUri(uri?: string | null) {
  if (!uri) return false;
  return (
    uri.startsWith('file://') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('content://')
  );
}

export function isBlockedLibraryUri(uri?: string | null) {
  if (!uri) return true;
  return uri.startsWith('ph://') || uri.startsWith('assets-library://');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    promise
      .then((value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
  });
}

function remember(assetId: string, uri: string) {
  const normalized = normalizeMediaUri(uri);
  uriCache.set(assetId, normalized);
  return normalized;
}

async function readAssetUri(
  asset: MediaLibrary.Asset,
  downloadFromNetwork: boolean,
  timeoutMs: number,
): Promise<string | null> {
  const info = await withTimeout(
    MediaLibrary.getAssetInfoAsync(asset, {
      shouldDownloadFromNetwork: downloadFromNetwork,
    }),
    timeoutMs,
  );
  if (!info) return null;

  const raw = info.localUri ?? info.uri;
  if (!raw || isBlockedLibraryUri(raw)) return null;
  return normalizeMediaUri(raw);
}

async function cacheVideoForPlayback(uri: string): Promise<string> {
  const normalized = normalizeMediaUri(uri);
  if (!normalized.startsWith('file://')) return normalized;

  const ext =
    normalized.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase() ?? 'mov';
  const dir = new Directory(Paths.cache, 'gallery-videos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, `${Date.now()}.${ext}`);

  try {
    new File(normalized).copy(target, { overwrite: true });
    if (target.exists) return target.uri;
  } catch {
    /* try legacy copy */
  }

  try {
    await FileSystem.copyAsync({ from: normalized, to: target.uri });
    return target.uri;
  } catch {
    return normalized;
  }
}

/** Photo thumb / image pick */
export async function resolveDisplayUri(asset: MediaLibrary.Asset): Promise<string | null> {
  const cached = uriCache.get(asset.id);
  if (cached && isDirectMediaUri(cached)) return cached;
  if (isDirectMediaUri(asset.uri)) return remember(asset.id, asset.uri);

  const local = await readAssetUri(asset, false, DISPLAY_TIMEOUT_MS);
  if (local && isDirectMediaUri(local)) return remember(asset.id, local);

  const remote = await readAssetUri(asset, true, DISPLAY_TIMEOUT_MS);
  if (remote && isDirectMediaUri(remote)) return remember(asset.id, remote);

  return local ?? remote;
}

export async function resolveVideoSourceUri(asset: MediaLibrary.Asset): Promise<string | null> {
  const cached = uriCache.get(asset.id);
  if (cached && isDirectMediaUri(cached)) return cached;
  if (isDirectMediaUri(asset.uri)) return remember(asset.id, asset.uri);

  const resolved =
    (await readAssetUri(asset, false, 3500)) ??
    (await readAssetUri(asset, true, PLAYBACK_TIMEOUT_MS));

  if (!resolved) return null;
  return remember(asset.id, resolved);
}

/** Video pick + playback — copy ลง cache ให้ expo-video เปิดได้เสถียร */
export async function resolvePlayableUri(asset: MediaLibrary.Asset): Promise<string | null> {
  const resolved = await resolveVideoSourceUri(asset);
  if (!resolved) return null;

  if (asset.mediaType === MediaLibrary.MediaType.video || isVideoAsset(asset)) {
    const cached = await cacheVideoForPlayback(resolved);
    uriCache.set(asset.id, cached);
    return cached;
  }

  return resolved;
}

async function generateVideoThumbnail(videoUri: string): Promise<string | null> {
  if (!isVideoThumbnailsNativeAvailable()) return null;

  let getThumbnailAsync:
    | ((
        source: string,
        options?: { time?: number; quality?: number },
      ) => Promise<{ uri: string }>)
    | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    getThumbnailAsync = require('expo-video-thumbnails').getThumbnailAsync;
  } catch {
    return null;
  }

  for (const time of [0, 500, 1500]) {
    try {
      const result = await getThumbnailAsync!(videoUri, { time, quality: 0.72 });
      if (result.uri) return result.uri;
    } catch {
      /* try next keyframe offset */
    }
  }

  return null;
}

/** Gallery grid — never throws; returns image URI, direct display URI, or null (placeholder UI). */
export async function resolveVideoThumbnailUri(asset: MediaLibrary.Asset): Promise<string | null> {
  const cached = videoThumbCache.get(asset.id);
  if (cached) {
    return cached === VIDEO_THUMB_PLACEHOLDER ? null : cached;
  }

  if (!isVideoThumbnailsNativeAvailable()) {
    videoThumbCache.set(asset.id, VIDEO_THUMB_PLACEHOLDER);
    if (isDirectMediaUri(asset.uri)) return asset.uri;
    const display = await resolveDisplayUri(asset);
    if (display && isDirectMediaUri(display)) {
      videoThumbCache.set(asset.id, display);
      return display;
    }
    return null;
  }

  try {
    const videoUri = await resolveVideoSourceUri(asset);
    if (!videoUri) {
      videoThumbCache.set(asset.id, VIDEO_THUMB_PLACEHOLDER);
      return null;
    }

    const thumbUri = await generateVideoThumbnail(videoUri);
    if (thumbUri) {
      videoThumbCache.set(asset.id, thumbUri);
      return thumbUri;
    }
  } catch {
    /* fall through to placeholder */
  }

  videoThumbCache.set(asset.id, VIDEO_THUMB_PLACEHOLDER);
  return null;
}

/** Warm cache for grid previews (no file copy) */
export function warmMediaUriCache(assets: MediaLibrary.Asset[]) {
  void Promise.all(
    assets.slice(0, 40).map((asset) =>
      isVideoAsset(asset) ? resolveVideoThumbnailUri(asset) : resolveDisplayUri(asset),
    ),
  );
}

export function cacheResolvedUri(assetId: string, uri: string) {
  return remember(assetId, uri);
}

/** Resolve URI for export/send — downloads from iCloud if needed. */
export async function resolveSendUri(asset: MediaLibrary.Asset): Promise<string> {
  const cached = uriCache.get(asset.id);
  if (cached && isDirectMediaUri(cached)) return cached;

  if (isVideoAsset(asset)) {
    const playable = await resolvePlayableUri(asset);
    if (playable) return playable;
  }

  const display = await resolveDisplayUri(asset);
  if (display) return display;

  if (isDirectMediaUri(asset.uri)) return remember(asset.id, asset.uri);
  return normalizeMediaUri(asset.uri);
}
