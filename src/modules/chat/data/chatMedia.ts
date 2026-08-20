/**
 * Compress images on-device, then upload bytes to chat media storage.
 * Chat API only receives the resulting URL.
 */

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getApiBase, useAuthStore } from '@/modules/auth/state/auth-store';
import { type ChatSendAttachment } from './chatRealtimeApi';
import { CHAT_IMAGE_MAX_BYTES, nextImageCompressStep } from '../domain/chat-media';

const UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

function authUploadHeaders(mimeType: string, filename: string) {
  const token = useAuthStore.getState().sessionToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-Mime-Type': mimeType,
    'X-Filename': filename,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function fileSize(uri: string) {
  try {
    const size = new File(uri).size;
    return typeof size === 'number' ? size : undefined;
  } catch {
    return undefined;
  }
}

async function readBytes(uri: string) {
  try {
    return await new File(uri).bytes();
  } catch {
    const res = await fetch(uri);
    return new Uint8Array(await res.arrayBuffer());
  }
}

function guessMime(uri: string, fallback: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

export function isRemoteMediaUrl(uri: string) {
  return /^https?:\/\//i.test(uri);
}

export async function compressChatImage(uri: string) {
  let width = 1600;
  let quality = 0.72;
  let current = uri;
  for (let i = 0; i < 6; i += 1) {
    const ctx = ImageManipulator.manipulate(current);
    ctx.resize({ width });
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: quality });
    current = saved.uri;
    const size = fileSize(current) ?? Number.POSITIVE_INFINITY;
    if (size <= CHAT_IMAGE_MAX_BYTES) {
      return { uri: current, mimeType: 'image/jpeg', filename: 'image.jpg', size };
    }
    const next = nextImageCompressStep(width, quality);
    if (!next) break;
    width = next.width;
    quality = next.quality;
  }
  return {
    uri: current,
    mimeType: 'image/jpeg',
    filename: 'image.jpg',
    size: fileSize(current) ?? 0,
  };
}

export async function prepareChatMedia(
  uri: string,
  opts?: { mimeType?: string; filename?: string; durationSec?: number },
): Promise<ChatSendAttachment> {
  if (isRemoteMediaUrl(uri)) {
    const mimeType = opts?.mimeType || guessMime(uri, 'application/octet-stream');
    return {
      url: uri,
      mimeType,
      size: 0,
      originalFilename: opts?.filename || 'file',
      duration: opts?.durationSec,
    };
  }

  const mimeHint = opts?.mimeType || guessMime(uri, 'image/jpeg');
  const prepared = mimeHint.startsWith('image/')
    ? await compressChatImage(uri)
    : {
        uri,
        mimeType: mimeHint,
        filename: opts?.filename || 'file',
        size: fileSize(uri) ?? 0,
      };

  if (prepared.size > UPLOAD_MAX_BYTES) {
    throw new Error('CHAT_MEDIA_TOO_LARGE');
  }

  const uploaded = await uploadChatMediaBytes(
    prepared.uri,
    prepared.mimeType,
    prepared.filename,
  );
  return {
    ...uploaded,
    duration: opts?.durationSec,
  };
}

export async function uploadChatMediaBytes(
  uri: string,
  mimeType: string,
  filename: string,
): Promise<ChatSendAttachment> {
  const bytes = await readBytes(uri);
  const viaPresign = await uploadViaPresign(bytes, mimeType, filename);
  if (viaPresign) return viaPresign;
  return uploadViaApi(bytes, mimeType, filename);
}

type PresignPayload = {
  uploadUrl: string;
  publicUrl: string;
  mimeType?: string;
  headers?: Record<string, string>;
  originalFilename?: string;
};

async function uploadViaPresign(
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
): Promise<ChatSendAttachment | null> {
  const base = getApiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/v1/chat-domain/media/presign-url`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ filename, mimeType }),
    });
    if (res.status === 501) return null;
    const json = (await res.json().catch(() => null)) as { data?: PresignPayload } | null;
    const data = json?.data;
    if (!res.ok || !data?.uploadUrl || !data.publicUrl) return null;
    const put = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: data.headers ?? { 'Content-Type': mimeType },
      body: bytes as BodyInit,
    });
    if (!put.ok) return null;
    return {
      url: data.publicUrl,
      mimeType: data.mimeType || mimeType,
      size: bytes.byteLength,
      originalFilename: data.originalFilename || filename,
    };
  } catch {
    return null;
  }
}

function jsonAuthHeaders() {
  const token = useAuthStore.getState().sessionToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function uploadViaApi(
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
): Promise<ChatSendAttachment> {
  const base = getApiBase();
  if (!base) throw new Error('no api');
  const res = await fetch(`${base}/api/v1/chat-domain/media`, {
    method: 'POST',
    headers: authUploadHeaders(mimeType, filename),
    body: bytes as BodyInit,
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: ChatSendAttachment; url?: string }
    | null;
  const data = json && typeof json === 'object' && json.data ? json.data : null;
  if (!res.ok || !data?.url) throw new Error('CHAT_MEDIA_UPLOAD_FAILED');
  return {
    url: data.url,
    mimeType: data.mimeType || mimeType,
    size: data.size ?? bytes.byteLength,
    originalFilename: data.originalFilename || filename,
  };
}

export async function prepareChatMediaList(uris: string[]) {
  const out: ChatSendAttachment[] = [];
  for (const uri of uris) {
    out.push(await prepareChatMedia(uri));
  }
  return out;
}
