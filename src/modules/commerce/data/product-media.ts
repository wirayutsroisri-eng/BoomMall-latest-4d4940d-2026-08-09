import type { ProductMediaItem } from '../domain/types';
import { Directory, File, Paths } from 'expo-file-system';
import {
  inferMediaType,
  mediaExtension,
} from '../domain/product-media';
import { pickSystemMediaFromLibrary } from '@/shared/media/systemMediaLibraryPicker';

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

/** System Photos picker — หน้าลงขายสินค้า / คลัง */
export async function pickProductMediaFromLibrary(input: {
  selectionLimit: number;
  allowVideo?: boolean;
}): Promise<ProductMediaItem[] | null> {
  const picked = await pickSystemMediaFromLibrary({
    selectionLimit: input.selectionLimit,
    allowVideo: input.allowVideo,
    videoMaxDuration: 180,
  });
  if (!picked?.length) return [];
  return persistProductMedia(
    picked.map((item) => ({
      uri: item.uri,
      type: item.type,
      sizeBytes: item.sizeBytes,
    })),
    `pick-${Date.now()}`,
  );
}
