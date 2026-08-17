import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ProductMediaItem } from '../domain/types';
import {
  inferMediaType,
  mediaExtension,
  validateProductVideo,
} from '../domain/product-media';

/**
 * Picked images/videos live in app cache which the OS can purge.
 * Copy into the document directory so listings keep media across restarts.
 */
const PRODUCTS_DIR = 'product-images';

function cleanUri(uri: string) {
  try {
    return decodeURI(uri.split('?')[0] ?? uri);
  } catch {
    return uri.split('?')[0] ?? uri;
  }
}

export function displayMediaUri(uri: string) {
  if (!uri) return uri;
  if (
    uri.startsWith('file://') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('data:') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://')
  ) {
    return uri;
  }
  if (uri.startsWith('/')) return `file://${uri}`;
  return uri;
}

function extensionOf(uri: string, filename?: string) {
  return mediaExtension(uri, filename) || (inferMediaType(uri, filename) === 'video' ? 'mp4' : 'jpg');
}

function copyLocalFile(uri: string, target: File): boolean {
  for (const candidate of [uri, cleanUri(uri)]) {
    try {
      const source = new File(candidate);
      source.copy(target, { overwrite: true });
      if (target.exists) return true;
    } catch {
      // try the next URI shape
    }
  }
  return false;
}

/** HEIC / photokit URIs often render as a black tile — transcode to JPEG first. */
async function toJpegFile(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return saved.uri;
}

export function persistProductMedia(
  items: ProductMediaItem[],
  masterId: string,
): ProductMediaItem[] {
  if (!items.length) return [];
  const dir = new Directory(Paths.document, PRODUCTS_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  return items.map((item, index) => {
    try {
      const target = new File(dir, `${masterId}-${index}.${extensionOf(item.uri)}`);
      if (!copyLocalFile(item.uri, target)) return { ...item, uri: displayMediaUri(item.uri) };
      const sizeBytes = typeof target.size === 'number' ? target.size : item.sizeBytes;
      return {
        uri: displayMediaUri(target.uri),
        type: item.type,
        sizeBytes,
      };
    } catch {
      return item;
    }
  });
}

export function persistProductImages(pickedUris: string[], masterId: string): string[] {
  return persistProductMedia(
    pickedUris.map((uri) => ({ uri, type: inferMediaType(uri) })),
    masterId,
  ).map((item) => item.uri);
}

export function fileSizeBytes(uri: string): number | undefined {
  try {
    const file = new File(cleanUri(uri));
    return typeof file.size === 'number' ? file.size : undefined;
  } catch {
    return undefined;
  }
}

function assetToMedia(
  asset: ImagePicker.ImagePickerAsset,
): ProductMediaItem | { reason: string } {
  const type =
    asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/')
      ? ('video' as const)
      : ('image' as const);
  const sizeBytes = asset.fileSize ?? fileSizeBytes(asset.uri);
  if (type === 'video') {
    const check = validateProductVideo({
      uri: asset.uri,
      filename: asset.fileName ?? undefined,
      sizeBytes,
    });
    if (!check.ok) return { reason: check.reason };
  }
  return { uri: asset.uri, type, sizeBytes };
}

/**
 * System Photos picker — returns file:// URIs RN Image can render.
 * Copies into the document dir immediately so the listing keeps the file.
 */
export async function pickProductMediaFromLibrary(input: {
  selectionLimit: number;
  allowVideo?: boolean;
}): Promise<ProductMediaItem[] | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('ต้องการสิทธิ์คลังภาพ', 'อนุญาตให้ BoomMall เข้าถึงรูปและวิดีโอในเครื่อง');
    return null;
  }

  const limit = Math.max(1, input.selectionLimit);
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: input.allowVideo ? ['images', 'videos'] : ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
    videoMaxDuration: 180,
    exif: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled || !result.assets?.length) return [];

  const incoming: ProductMediaItem[] = [];
  for (const asset of result.assets) {
    const mapped = assetToMedia(asset);
    if ('reason' in mapped) {
      Alert.alert('ไฟล์ใช้ไม่ได้', mapped.reason);
      continue;
    }
    if (mapped.type === 'image') {
      try {
        mapped.uri = await toJpegFile(mapped.uri);
      } catch {
        mapped.uri = displayMediaUri(mapped.uri);
      }
    }
    incoming.push({ ...mapped, uri: displayMediaUri(mapped.uri) });
  }
  if (!incoming.length) return [];
  return persistProductMedia(incoming, `pick-${Date.now()}`);
}
