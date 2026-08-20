import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { normalizeMediaUri } from '@/shared/media/resolveMediaLibraryUri';

/**
 * ImagePicker / Camera cache files can vanish before publish.
 * Copy into the document directory so preview → post still has a file.
 */
export async function persistCreateMedia(
  uri: string,
  type: 'image' | 'video',
): Promise<string> {
  if (!uri) return uri;
  const source = normalizeMediaUri(uri);
  const dir = new Directory(Paths.document, 'create-media');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  if (type === 'image') {
    try {
      const ctx = ImageManipulator.manipulate(source);
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.88 });
      const target = new File(dir, `${Date.now()}.jpg`);
      new File(saved.uri).copy(target, { overwrite: true });
      if (target.exists) return target.uri;
      return saved.uri;
    } catch {
      // fall through to raw copy
    }
  }

  const ext =
    source.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase() ??
    (type === 'video' ? 'mov' : 'jpg');
  const target = new File(dir, `${Date.now()}.${ext}`);
  try {
    new File(source).copy(target, { overwrite: true });
    if (target.exists) return target.uri;
  } catch {
    /* try legacy copy */
  }
  try {
    await FileSystem.copyAsync({ from: source, to: target.uri });
    return target.uri;
  } catch {
    return source;
  }
}
