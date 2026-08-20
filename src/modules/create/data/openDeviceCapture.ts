import { Alert, NativeModules, Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { persistCreateMedia } from './persistCreateMedia';
import { useCreateDraftStore } from '../state/create-draft-store';
import { useMusicPlayerStore } from '@/modules/music/state/music-player-store';
import { isRouteMounted, safePush } from '@/shared/navigation/safeNavigate';
import { normalizeMediaUri } from '@/shared/media/resolveMediaLibraryUri';
import { SHARED_MEDIA_GALLERY_LIMIT } from '@/shared/media/openSharedMediaGallery';
import { pickSystemMediaFromLibrary } from '@/shared/media/systemMediaLibraryPicker';

let busy = false;

/** @deprecated use SHARED_MEDIA_GALLERY_LIMIT */
export const MAX_CREATE_GALLERY_SELECTION = SHARED_MEDIA_GALLERY_LIMIT;

/** iOS Simulator has no camera hardware. */
export function isIosSimulator(): boolean {
  if (Platform.OS !== 'ios') return false;
  const nativeFlag =
    NativeModules.ExponentConstants?.isDevice ??
    NativeModules.EXConstants?.isDevice ??
    (Constants as { isDevice?: boolean }).isDevice;
  if (typeof nativeFlag === 'boolean') return nativeFlag === false;
  const ios = Constants.platform?.ios;
  const blob = `${ios?.model ?? ''} ${ios?.platform ?? ''}`;
  return /simulator/i.test(blob);
}

async function goPreview(uri: string, type: 'image' | 'video') {
  const normalized = normalizeMediaUri(uri);
  useCreateDraftStore.getState().setDraft({
    uri: normalized,
    type,
    baked: false,
  });
  router.push({
    pathname: '/create-preview',
    params: { type, uri: normalized },
  });

  void persistCreateMedia(normalized, type).then((stable) => {
    if (stable && stable !== normalized) {
      useCreateDraftStore.getState().setDraft({ uri: stable });
    }
  });
}

export async function beginCreateFromUri(uri: string, type: 'image' | 'video') {
  await goPreview(uri, type);
}

/** Gallery multi-pick → preview (single video/image or multi-photo carousel). */
export async function beginCreateFromGalleryItems(
  items: Array<{ uri: string; mediaType: 'image' | 'video' }>,
) {
  if (!items.length) return;

  if (items.length === 1) {
    const one = items[0]!;
    await beginCreateFromUri(one.uri, one.mediaType);
    return;
  }

  const hasVideo = items.some((i) => i.mediaType === 'video');
  if (hasVideo) {
    const first = items.find((i) => i.mediaType === 'video') ?? items[0]!;
    await beginCreateFromUri(first.uri, 'video');
    return;
  }

  const firstUri = normalizeMediaUri(items[0]!.uri);
  useCreateDraftStore.getState().setDraft({
    uri: firstUri,
    type: 'image',
    baked: false,
    mediaUris: items.map((i) => normalizeMediaUri(i.uri)),
  });
  router.push({
    pathname: '/create-preview',
    params: { type: 'image', uri: firstUri },
  });
  void Promise.all(items.map((i) => persistCreateMedia(i.uri, 'image'))).then((uris) => {
    if (!uris.length) return;
    useCreateDraftStore.getState().setDraft({
      uri: uris[0]!,
      mediaUris: uris,
    });
  });
}

/** Native Photos picker — same library as ลงขายสินค้า (works above create-capture modal). */
export async function pickCreateMediaFromLibrary(): Promise<void> {
  const picked = await pickSystemMediaFromLibrary({
    selectionLimit: SHARED_MEDIA_GALLERY_LIMIT,
    allowVideo: true,
    videoMaxDuration: 60,
  });
  if (!picked?.length) return;
  await beginCreateFromGalleryItems(
    picked.map((item) => ({ uri: item.uri, mediaType: item.type })),
  );
}

function assetType(asset: ImagePicker.ImagePickerAsset): 'image' | 'video' {
  if (asset.type === 'video') return 'video';
  if (asset.mimeType?.startsWith('video/')) return 'video';
  if (/\.(mp4|mov|m4v)$/i.test(asset.uri)) return 'video';
  return 'image';
}


const CAMERA_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images', 'videos'],
  allowsEditing: false,
  quality: 1,
  videoMaxDuration: 60,
  videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
  cameraType: ImagePicker.CameraType.back,
  presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
};

export type DeviceCaptureMode = 'photo' | 'video15' | 'video60';

export type DeviceCaptureFacing = 'front' | 'back';

function buildCameraOpts(mode: DeviceCaptureMode, facing: DeviceCaptureFacing): ImagePicker.ImagePickerOptions {
  const videoOnly = mode !== 'photo';
  return {
    ...CAMERA_OPTS,
    mediaTypes: videoOnly ? ['videos'] : ['images'],
    videoMaxDuration: mode === 'video60' ? 60 : 15,
    cameraType: facing === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };
}

/** Native camera fallback when expo-camera live preview is unavailable. */
export async function captureWithDeviceCamera(
  mode: DeviceCaptureMode = 'photo',
  facing: DeviceCaptureFacing = 'back',
): Promise<'captured' | 'canceled' | 'denied'> {
  if (isIosSimulator()) {
    Alert.alert('ซิมูเลเตอร์ไม่มีกล้อง', 'เลือกจากคลังภาพแทนได้');
    return 'denied';
  }
  if (busy) return 'canceled';
  busy = true;
  useMusicPlayerStore.getState().pause();
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์กล้อง', 'กรุณาอนุญาตให้ BoomMall ใช้กล้องเพื่อถ่ายคอนเทนต์');
      return 'denied';
    }
    const result = await ImagePicker.launchCameraAsync(buildCameraOpts(mode, facing));
    if (result.canceled || !result.assets[0]) {
      return 'canceled';
    }
    const asset = result.assets[0];
    await goPreview(asset.uri, assetType(asset));
    return 'captured';
  } catch (e) {
    Alert.alert('เปิดกล้องไม่ได้', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    return 'denied';
  } finally {
    busy = false;
  }
}

/** Tab สร้าง — กล้อง + คลังรูป/วิดีโอในหน้าเดียว (TikTok-style) */
export function openCreateFlowFromTab(): boolean {
  if (isRouteMounted('create-capture') || isRouteMounted('create-preview') || busy) {
    return false;
  }
  return safePush('/create-capture');
}

/** เปิดกล้องระบบ — จากไทล์กล้องในคลัง */
export async function captureFromDeviceCamera(): Promise<'captured' | 'canceled' | 'denied'> {
  if (isIosSimulator()) {
    Alert.alert('ซิมูเลเตอร์ไม่มีกล้อง', 'เลือกจากคลังภาพแทนได้');
    return 'denied';
  }
  if (busy) return 'canceled';
  busy = true;
  useMusicPlayerStore.getState().pause();
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์กล้อง', 'กรุณาอนุญาตให้ BoomMall ใช้กล้องเพื่อถ่ายคอนเทนต์');
      return 'denied';
    }
    const result = await ImagePicker.launchCameraAsync(buildCameraOpts('photo', 'back'));
    if (result.canceled || !result.assets[0]) {
      return 'canceled';
    }
    const asset = result.assets[0];
    await goPreview(asset.uri, assetType(asset));
    return 'captured';
  } catch (e) {
    Alert.alert('เปิดกล้องไม่ได้', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    return 'denied';
  } finally {
    busy = false;
  }
}
