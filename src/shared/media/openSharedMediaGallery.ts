import { MAX_PRODUCT_MEDIA } from '@/modules/commerce/domain/product-media';
import { pickDevicePhotos } from '@/shared/media/photoLibraryStore';
import type { PickedGalleryItem } from '@/shared/media/MediaGalleryPicker';

/** Max selectable items — shared by ลงขายสินค้า + หน้ากล้อง */
export const SHARED_MEDIA_GALLERY_LIMIT = MAX_PRODUCT_MEDIA;

export type SharedMediaGalleryOptions = {
  selectionLimit?: number;
  /** When true: แท็บ รูปภาพ / วิดีโอ + เลือกวิดีโอได้ */
  allowVideo?: boolean;
  title?: string;
  sendLabel?: string;
};

export type SharedMediaGalleryPickerProps = {
  initialMode: 'photo' | 'video';
  allowModeSwitch: boolean;
  selectionLimit: number;
  title: string;
  sendLabel: string;
};

/** Props สำหรับ `<MediaGalleryPicker />` — ใช้ร่วมกันทุกหน้า */
export function sharedMediaGalleryPickerProps(
  options: SharedMediaGalleryOptions & { initialMode?: 'photo' | 'video' } = {},
): SharedMediaGalleryPickerProps {
  const allowVideo = options.allowVideo ?? true;
  const limit = Math.max(1, options.selectionLimit ?? SHARED_MEDIA_GALLERY_LIMIT);
  return {
    initialMode: options.initialMode ?? 'photo',
    allowModeSwitch: allowVideo,
    selectionLimit: limit,
    title: options.title ?? 'ล่าสุด',
    sendLabel: options.sendLabel ?? 'เลือก',
  };
}

/**
 * Opens MediaGalleryPicker (PhotoLibraryHost) — ใช้ร่วมกันทั้งแอป
 * ลงขายสินค้า · หน้ากล้อง · โพสต์ · แชต
 */
export function openSharedMediaGallery(
  options: SharedMediaGalleryOptions = {},
): Promise<PickedGalleryItem[]> {
  const props = sharedMediaGalleryPickerProps(options);
  return pickDevicePhotos({
    selectionLimit: props.selectionLimit,
    videos: props.allowModeSwitch,
    allowModeSwitch: props.allowModeSwitch,
    title: props.title,
    sendLabel: props.sendLabel,
  });
}
