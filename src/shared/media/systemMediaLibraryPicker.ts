import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { validateProductVideo } from '@/modules/commerce/domain/product-media';
import { displayMediaUri, fileSizeBytes } from '@/modules/commerce/data/product-media';
import { generateVideoThumbnail } from '@/shared/media/videoThumbnails';

export type SystemPickedMedia = {
  uri: string;
  type: 'image' | 'video';
  filename?: string;
  sizeBytes?: number;
  /** First-frame poster extracted for every video so tiles render instantly. */
  thumbnailUri?: string;
};

async function toJpegFile(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return saved.uri;
}


/**
 * PHPicker on iOS returns a Photo-Library path (e.g. .../PhotoData/Mutations/.../FullSizeRender.mov
 * or a ph:// / assets-library:// URI) that the app cannot open directly. Copy the
 * video out of the Photo Library into a permanent cache path
 * (`cacheDirectory/picked-videos/picked_video_xxx.mp4`) so expo-video AND
 * expo-video-thumbnails can always open the file.
 */
async function copyVideoToCache(
  uri: string,
  filename?: string,
  assetId?: string,
): Promise<string> {
  const ext = (filename?.match(/\.(\w{2,5})$/i)?.[1] ?? 'mov').toLowerCase();
  const dir = new Directory(Paths.cache, 'picked-videos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new File(
    dir,
    `picked_video_${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`,
  );

  // ph:// / assets-library:// paths can't be copied directly — ask the OS for a
  // real local file via the asset id first, then try to copy that.
  const candidates: string[] = [uri];
  if (assetId && (uri.startsWith('ph://') || uri.startsWith('assets-library://'))) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(assetId);
      if (info?.localUri) {
        console.log('[systemMediaLibraryPicker] resolved localUri from MediaLibrary:', info.localUri);
        candidates.push(info.localUri);
      }
    } catch (e) {
      console.log('[systemMediaLibraryPicker] MediaLibrary.getAssetInfoAsync failed', e);
    }
  }

  for (const candidate of candidates) {
    try {
      await FileSystem.copyAsync({ from: candidate, to: target.uri });
      if (target.exists) {
        console.log('[systemMediaLibraryPicker] copied video to cache:', target.uri);
        return target.uri;
      }
    } catch (e) {
      console.log('[systemMediaLibraryPicker] copyAsync failed for', candidate, e);
    }
  }

  try {
    new File(uri).copy(target, { overwrite: true });
    if (target.exists) {
      console.log('[systemMediaLibraryPicker] File.copy fallback ok:', target.uri);
      return target.uri;
    }
  } catch (e) {
    console.log('[systemMediaLibraryPicker] File.copy failed for', uri, e);
  }

  console.warn('[systemMediaLibraryPicker] could not copy video — falling back to original URI', uri);
  return uri;
}

function assetToSystemMedia(
  asset: ImagePicker.ImagePickerAsset,
): SystemPickedMedia | { reason: string } {
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
  return {
    uri: asset.uri,
    type,
    filename: asset.fileName ?? undefined,
    sizeBytes,
  };
}

/**
 * Native Photos library (PHPicker) — same picker as ลงขายสินค้า.
 * Returns displayable file:// URIs; images transcoded from HEIC when needed.
 */
export async function pickSystemMediaFromLibrary(input: {
  selectionLimit: number;
  allowVideo?: boolean;
  videoMaxDuration?: number;
}): Promise<SystemPickedMedia[] | null> {
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
    videoMaxDuration: input.videoMaxDuration ?? 180,
    exif: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled || !result.assets?.length) return [];

  const incoming: SystemPickedMedia[] = [];
  for (const asset of result.assets) {
    const mapped = assetToSystemMedia(asset);
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
    } else {
      // Copy out of the Photo Library so expo-video can actually open the file.
      mapped.uri = await copyVideoToCache(mapped.uri, mapped.filename, asset.assetId ?? undefined);
      // Always try to extract a first-frame poster for the video — 100ms in to
      // skip a black opening frame. Never gated on a native-module probe: the
      // getThumbnailAsync call itself fails gracefully when unsupported.
      try {
        const thumb = await generateVideoThumbnail(mapped.uri);
        if (thumb) {
          mapped.thumbnailUri = displayMediaUri(thumb);
          console.log('[systemMediaLibraryPicker] video thumbnail ready:', mapped.thumbnailUri);
        } else {
          console.warn('[systemMediaLibraryPicker] no thumbnail generated for', mapped.uri);
        }
      } catch (e) {
        console.error('[systemMediaLibraryPicker] thumbnail generation threw', e);
      }
    }
    incoming.push({ ...mapped, uri: displayMediaUri(mapped.uri) });
  }

  if (!incoming.length) return [];
  return incoming;
}
