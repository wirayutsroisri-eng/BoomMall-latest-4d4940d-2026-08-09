import { Alert } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { PickedGalleryItem } from '@/shared/media/MediaGalleryPicker';
import {
  displayMediaUri,
  fileSizeBytes,
  persistProductMedia,
} from '@/modules/commerce/data/product-media';
import { validateProductVideo } from '@/modules/commerce/domain/product-media';
import type { ProductMediaItem } from '@/modules/commerce/domain/types';

/** HEIC / photokit URIs often render as a black tile — transcode to JPEG first. */
export async function transcodeGalleryImageToJpeg(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return saved.uri;
}

export async function normalizePickedGalleryItem(
  item: PickedGalleryItem,
): Promise<
  { ok: true; uri: string; mediaType: 'image' | 'video' } | { ok: false; reason: string }
> {
  const mediaType = item.mediaType === 'video' ? 'video' : 'image';
  const sizeBytes = fileSizeBytes(item.uri);

  if (mediaType === 'video') {
    const check = validateProductVideo({
      uri: item.uri,
      filename: item.filename,
      sizeBytes,
    });
    if (!check.ok) return { ok: false, reason: check.reason };
    return { ok: true, uri: displayMediaUri(item.uri), mediaType: 'video' };
  }

  try {
    return {
      ok: true,
      uri: displayMediaUri(await transcodeGalleryImageToJpeg(item.uri)),
      mediaType: 'image',
    };
  } catch {
    return { ok: true, uri: displayMediaUri(item.uri), mediaType: 'image' };
  }
}

/** Same post-pick pipeline as ลงขายสินค้า — JPEG transcode, video check, persist to document dir. */
export async function processPickedGalleryItems(
  items: PickedGalleryItem[],
): Promise<ProductMediaItem[]> {
  const incoming: ProductMediaItem[] = [];

  for (const item of items) {
    const normalized = await normalizePickedGalleryItem(item);
    if (!normalized.ok) {
      Alert.alert('ไฟล์ใช้ไม่ได้', normalized.reason);
      continue;
    }
    incoming.push({
      uri: normalized.uri,
      type: normalized.mediaType,
      sizeBytes: fileSizeBytes(normalized.uri),
    });
  }

  if (!incoming.length) return [];
  return persistProductMedia(incoming, `pick-${Date.now()}`);
}
