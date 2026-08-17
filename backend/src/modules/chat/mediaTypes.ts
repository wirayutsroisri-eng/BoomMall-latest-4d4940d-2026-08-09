export const CHAT_MEDIA_MAX_BYTES = 12 * 1024 * 1024;

export const CHAT_MEDIA_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'application/pdf': 'pdf',
};

export function chatMediaExtension(mimeType: string) {
  const mime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return CHAT_MEDIA_MIME_EXT[mime] ?? null;
}

export function normalizeChatMime(mimeType: string) {
  const mime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}
