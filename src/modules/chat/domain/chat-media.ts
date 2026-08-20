import type { ChatMessage, MessageKind } from './types';

export type ChatAttachmentLike = {
  url: string;
  mimeType: string;
  size?: number;
  originalFilename?: string;
  duration?: number;
};

export function attachmentsToMessageFields(
  attachments?: ChatAttachmentLike[] | null,
): Partial<Pick<ChatMessage, 'kind' | 'imageUri' | 'imageUris' | 'fileUri' | 'fileName' | 'mimeType' | 'fileSize' | 'audioUri' | 'durationSec'>> {
  const rows = (attachments ?? []).filter((a) => a.url);
  if (!rows.length) return {};

  const images = rows.filter((a) => a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/'));
  const audio = rows.find((a) => a.mimeType.startsWith('audio/'));
  if (images.length) {
    const uris = images.map((a) => a.url);
    return { kind: 'image', imageUri: uris[0], imageUris: uris };
  }
  if (audio) {
    return {
      kind: 'voice',
      audioUri: audio.url,
      mimeType: audio.mimeType,
      durationSec: audio.duration != null ? Math.round(audio.duration) : undefined,
    };
  }
  const file = rows[0];
  return {
    kind: 'file',
    fileUri: file.url,
    fileName: file.originalFilename || 'file',
    mimeType: file.mimeType,
    fileSize: file.size,
  };
}

export function kindFromRemote(kind?: string, attachments?: ChatAttachmentLike[] | null): MessageKind {
  const fromFiles = attachmentsToMessageFields(attachments).kind;
  if (fromFiles) return fromFiles;
  const raw = (kind || 'TEXT').toUpperCase();
  if (raw === 'IMAGE' || raw === 'VIDEO') return 'image';
  if (raw === 'VOICE' || raw === 'AUDIO') return 'voice';
  if (raw === 'FILE') return 'file';
  if (raw === 'PRODUCT') return 'product';
  return 'text';
}

export const CHAT_IMAGE_MAX_BYTES = 1_600_000;

export function nextImageCompressStep(width: number, quality: number) {
  if (quality > 0.42) return { width, quality: Math.round((quality - 0.12) * 100) / 100 };
  if (width > 800) return { width: Math.max(800, Math.round(width * 0.85)), quality: 0.55 };
  return null;
}
