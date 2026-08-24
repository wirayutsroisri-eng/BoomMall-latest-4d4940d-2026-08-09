import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';
import type { MediaAsset, MediaAssetType } from '../domain/mediaAsset';

type UploadSession = {
  asset: MediaAsset;
  upload: {
    uploadUrl: string;
    headers?: Record<string, string>;
    mimeType: string;
  };
};

const MEDIA_API_TIMEOUT_MS = 30_000;
const OBJECT_UPLOAD_TIMEOUT_MS = 120_000;

export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly step?: string,
  ) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  step: string,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MediaUploadError(
      controller.signal.aborted ? `${step}_TIMEOUT` : message,
      undefined,
      step,
    );
  } finally {
    clearTimeout(timer);
  }
}

function inferMime(uri: string, type: MediaAssetType) {
  const clean = uri.toLowerCase().split('?')[0] ?? '';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.heic')) return 'image/heic';
  if (clean.endsWith('.heif')) return 'image/heif';
  if (clean.endsWith('.mov')) return 'video/quicktime';
  if (clean.endsWith('.m4v')) return 'video/x-m4v';
  if (clean.endsWith('.mp4')) return 'video/mp4';
  return type === 'video' ? 'video/mp4' : 'image/jpeg';
}

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const base = getApiBase();
  if (!base) throw new Error('MEDIA_API_UNAVAILABLE');
  const response = await fetchWithTimeout(`${base}${path}`, init, MEDIA_API_TIMEOUT_MS, path);
  let bodyTimer: ReturnType<typeof setTimeout> | undefined;
  const json = await Promise.race([
    response.json().catch(() => null),
    new Promise<null>((_, reject) => {
      bodyTimer = setTimeout(
        () => reject(new MediaUploadError(`${path}_RESPONSE_TIMEOUT`, response.status, path)),
        MEDIA_API_TIMEOUT_MS,
      );
    }),
  ]).finally(() => {
    if (bodyTimer) clearTimeout(bodyTimer);
  }) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !json?.data) {
    throw new MediaUploadError(
      json?.error?.code || json?.error?.message || 'MEDIA_ASSET_REQUEST_FAILED',
      response.status,
      path,
    );
  }
  return json.data;
}

export async function uploadMediaAsset(input: {
  uri: string;
  type: MediaAssetType;
  width?: number;
  height?: number;
  duration?: number;
  mimeType?: string;
}): Promise<MediaAsset> {
  console.info('[POST_MEDIA] local file selected', { type: input.type, scheme: input.uri.split(':')[0] });
  const file = new File(input.uri);
  if (!file.exists) throw new Error('MEDIA_LOCAL_FILE_MISSING');
  const mimeType = input.mimeType || file.type || inferMime(input.uri, input.type);
  const session = await apiJson<UploadSession>('/api/v1/media-assets/upload-session', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      type: input.type,
      filename: file.name || `media-${Date.now()}`,
      mimeType,
      fileSize: file.size,
      width: input.width,
      height: input.height,
      duration: input.duration,
    }),
  });
  const uploadTarget = new URL(session.upload.uploadUrl);
  console.info('[POST_MEDIA] presign success', {
    uploadTarget: `${uploadTarget.protocol}//${uploadTarget.host}${uploadTarget.pathname}`,
  });
  console.info('[POST_MEDIA] S3 PUT start');
  console.info('[POST_FLOW] 02 media upload start', {
    assetId: session.asset.id,
    storageKey: session.asset.storageKey,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OBJECT_UPLOAD_TIMEOUT_MS);
  let uploaded: Response;
  try {
    uploaded = await expoFetch(session.upload.uploadUrl, {
      method: 'PUT',
      headers: session.upload.headers ?? { 'Content-Type': session.upload.mimeType },
      body: file,
      signal: controller.signal,
    });
  } catch (error) {
    throw new MediaUploadError(
      controller.signal.aborted
        ? 'MEDIA_OBJECT_UPLOAD_TIMEOUT'
        : error instanceof Error ? error.message : String(error),
      undefined,
      'object-upload',
    );
  } finally {
    clearTimeout(timer);
  }
  if (!uploaded.ok) {
    throw new MediaUploadError(`MEDIA_OBJECT_UPLOAD_FAILED_${uploaded.status}`, uploaded.status, 'object-upload');
  }
  console.info(`[POST_MEDIA] S3 PUT status=${uploaded.status}`);
  console.info('[POST_FLOW] 03 media upload success', {
    assetId: session.asset.id,
    storageKey: session.asset.storageKey,
  });
  const ready = await apiJson<MediaAsset>(`/api/v1/media-assets/${encodeURIComponent(session.asset.id)}/confirm`, {
    method: 'POST',
    headers: authHeaders(),
    body: '{}',
  });
  if (ready.status !== 'ready') throw new MediaUploadError('MEDIA_ASSET_NOT_READY', undefined, 'confirm');
  if (!/^https?:\/\//i.test(ready.canonicalUrl)) {
    throw new MediaUploadError('MEDIA_REMOTE_URL_INVALID', undefined, 'confirm');
  }
  console.info('[POST_FLOW] 04 remote url received', {
    assetId: ready.id,
    storageKey: ready.storageKey,
    remoteUrl: ready.canonicalUrl,
  });
  console.info('[POST_MEDIA] confirm success', {
    objectKey: ready.storageKey,
    canonicalUrl: ready.canonicalUrl,
  });
  return ready;
}
