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
  const response = await fetch(`${base}${path}`, init);
  const json = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !json?.data) {
    throw new Error(json?.error?.code || json?.error?.message || 'MEDIA_ASSET_REQUEST_FAILED');
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
  const uploaded = await expoFetch(session.upload.uploadUrl, {
    method: 'PUT',
    headers: session.upload.headers ?? { 'Content-Type': session.upload.mimeType },
    body: file,
  });
  if (!uploaded.ok) throw new Error(`MEDIA_OBJECT_UPLOAD_FAILED_${uploaded.status}`);
  const ready = await apiJson<MediaAsset>(`/api/v1/media-assets/${encodeURIComponent(session.asset.id)}/confirm`, {
    method: 'POST',
    headers: authHeaders(),
    body: '{}',
  });
  if (ready.status !== 'ready') throw new Error('MEDIA_ASSET_NOT_READY');
  return ready;
}
