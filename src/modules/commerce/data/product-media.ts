import { Directory, File, Paths } from 'expo-file-system';

/**
 * Picked images live in the app cache (ImagePicker directory) which the OS can
 * purge. Copy them into the document directory so listed products keep their
 * photos across restarts.
 */
const PRODUCTS_DIR = 'product-images';

function extensionOf(uri: string) {
  const match = /\.(\w{2,5})(?:\?|#|$)/.exec(uri);
  return match ? match[1].toLowerCase() : 'jpg';
}

export function persistProductImages(pickedUris: string[], masterId: string): string[] {
  const dir = new Directory(Paths.document, PRODUCTS_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  const saved: string[] = [];
  pickedUris.forEach((uri, index) => {
    try {
      const source = new File(uri);
      const target = new File(dir, `${masterId}-${index}.${extensionOf(uri)}`);
      source.copy(target, { overwrite: true });
      saved.push(target.uri);
    } catch {
      // Keep the original cache URI as a fallback — better than dropping the photo.
      saved.push(uri);
    }
  });
  return saved;
}
