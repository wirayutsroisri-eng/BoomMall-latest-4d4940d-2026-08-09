import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { validateProductVideo } from '@/modules/commerce/domain/product-media';
import { displayMediaUri, fileSizeBytes } from '@/modules/commerce/data/product-media';

export type SystemPickedMedia = {
  uri: string;
  type: 'image' | 'video';
  filename?: string;
  sizeBytes?: number;
};

async function toJpegFile(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return saved.uri;
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
      mapped.uri = displayMediaUri(mapped.uri);
    }
    incoming.push({ ...mapped, uri: displayMediaUri(mapped.uri) });
  }

  if (!incoming.length) return [];
  return incoming;
}
