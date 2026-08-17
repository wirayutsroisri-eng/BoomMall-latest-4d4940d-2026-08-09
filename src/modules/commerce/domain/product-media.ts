import type { MasterSku, ProductMediaItem, ProductMediaType } from './types';

export const MAX_PRODUCT_MEDIA = 6;
export const MAX_ARTICLE_IMAGES = 8;
/** Between the 50–100MB product-video cap */
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const MAX_VIDEO_MB = 80;

const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif']);

export function mediaExtension(uri: string, filename?: string) {
  const source = filename || uri;
  const match = /\.(\w{2,5})(?:\?|#|$)/.exec(source);
  return match ? match[1].toLowerCase() : '';
}

export function inferMediaType(
  uri: string,
  filename?: string,
  hint?: 'photo' | 'video' | ProductMediaType,
): ProductMediaType {
  if (hint === 'video' || hint === 'photo') return hint === 'video' ? 'video' : 'image';
  if (hint === 'image' || hint === 'video') return hint;
  const ext = mediaExtension(uri, filename);
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'image';
}

export function isAllowedVideo(uri: string, filename?: string) {
  const ext = mediaExtension(uri, filename);
  return !ext || VIDEO_EXT.has(ext);
}

export function validateProductVideo(input: {
  uri: string;
  filename?: string;
  sizeBytes?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!isAllowedVideo(input.uri, input.filename)) {
    return { ok: false, reason: 'รองรับวิดีโอ .mp4 / .mov เท่านั้น' };
  }
  if (input.sizeBytes != null && input.sizeBytes > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      reason: `ไฟล์วิดีโอใหญ่เกิน ${MAX_VIDEO_MB} MB`,
    };
  }
  return { ok: true };
}

export function fromLegacyImages(imageUris?: string[], imageUri?: string): ProductMediaItem[] {
  const uris = imageUris?.length ? imageUris : imageUri ? [imageUri] : [];
  return uris.filter(Boolean).map((uri) => ({
    uri,
    type: inferMediaType(uri),
  }));
}

export function resolveProductMedia(
  product: Pick<MasterSku, 'media' | 'imageUris' | 'imageUri'>,
): ProductMediaItem[] {
  if (product.media?.length) return product.media;
  return fromLegacyImages(product.imageUris, product.imageUri);
}

export function imageUrisOf(media: ProductMediaItem[]): string[] {
  return media.filter((m) => m.type === 'image').map((m) => m.uri);
}

export function firstImageUri(media: ProductMediaItem[]): string | undefined {
  return media.find((m) => m.type === 'image')?.uri;
}

export function coverMedia(media: ProductMediaItem[]): ProductMediaItem | undefined {
  return media[0];
}

export function hasVideo(media: ProductMediaItem[]): boolean {
  return media.some((m) => m.type === 'video');
}

export function mergePickedMedia(
  current: ProductMediaItem[],
  incoming: ProductMediaItem[],
): { ok: true; media: ProductMediaItem[] } | { ok: false; reason: string } {
  const next = [...current];
  for (const item of incoming) {
    if (item.type === 'video') {
      const check = validateProductVideo({ uri: item.uri, sizeBytes: item.sizeBytes });
      if (!check.ok) return check;
      if (hasVideo(next)) {
        const idx = next.findIndex((m) => m.type === 'video');
        next[idx] = item;
      } else if (next.length >= MAX_PRODUCT_MEDIA) {
        return { ok: false, reason: `สื่อได้สูงสุด ${MAX_PRODUCT_MEDIA} ไฟล์` };
      } else {
        next.unshift(item);
      }
      continue;
    }
    if (next.length >= MAX_PRODUCT_MEDIA) {
      return { ok: false, reason: `สื่อได้สูงสุด ${MAX_PRODUCT_MEDIA} ไฟล์` };
    }
    next.push(item);
  }
  return { ok: true, media: next.slice(0, MAX_PRODUCT_MEDIA) };
}

/** Spec / how-to photos under the listing articles — images only. */
export function mergeArticleImages(
  current: ProductMediaItem[],
  incoming: ProductMediaItem[],
): { ok: true; media: ProductMediaItem[] } | { ok: false; reason: string } {
  const images = incoming.filter((item) => item.type === 'image');
  if (!images.length && incoming.length) {
    return { ok: false, reason: 'ใส่ได้เฉพาะรูปภาพ' };
  }
  const next = [...current];
  for (const item of images) {
    if (next.length >= MAX_ARTICLE_IMAGES) {
      return { ok: false, reason: `ใส่รูปได้สูงสุด ${MAX_ARTICLE_IMAGES} รูป` };
    }
    next.push(item);
  }
  return { ok: true, media: next.slice(0, MAX_ARTICLE_IMAGES) };
}

/** Replace one gallery slot, then append any extra picks. Still max one video. */
export function replaceMediaAt(
  current: ProductMediaItem[],
  index: number,
  incoming: ProductMediaItem[],
): { ok: true; media: ProductMediaItem[] } | { ok: false; reason: string } {
  if (!incoming.length) return { ok: true, media: current };
  if (index < 0 || index >= current.length) {
    return mergePickedMedia(current, incoming);
  }
  const first = incoming[0]!;
  if (first.type === 'video') {
    const check = validateProductVideo({ uri: first.uri, sizeBytes: first.sizeBytes });
    if (!check.ok) return check;
  }
  const next = [...current];
  next[index] = first;
  if (first.type === 'video') {
    for (let i = next.length - 1; i >= 0; i -= 1) {
      if (i !== index && next[i]?.type === 'video') next.splice(i, 1);
    }
  }
  return mergePickedMedia(next, incoming.slice(1));
}

export function listingThumbUri(
  product: Pick<MasterSku, 'media' | 'imageUris' | 'imageUri'>,
): string | undefined {
  return firstImageUri(resolveProductMedia(product));
}

export function coverKindOf(
  product: Pick<MasterSku, 'media' | 'imageUris' | 'imageUri'>,
): ProductMediaType {
  return coverMedia(resolveProductMedia(product))?.type ?? 'image';
}
