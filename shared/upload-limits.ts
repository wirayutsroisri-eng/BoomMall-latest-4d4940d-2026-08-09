/** Max image upload size (product photos, avatars, slips, QR codes). */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Max video upload size for product listings. */
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;

export function formatUploadLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
}
