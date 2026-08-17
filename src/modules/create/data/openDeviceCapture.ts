import { Alert, NativeModules, Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { persistCreateMedia } from './persistCreateMedia';
import { useCreateDraftStore } from '../state/create-draft-store';
import { useCreateStudioStore } from '../state/create-studio-store';
import { useMusicPlayerStore } from '@/modules/music/state/music-player-store';

let busy = false;

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
  useCreateStudioStore.getState().close();
  const stable = await persistCreateMedia(uri, type);
  useCreateDraftStore.getState().setDraft({
    uri: stable,
    type,
    baked: false,
    filter: 'none',
  });
  router.push({
    pathname: '/create-preview',
    params: { type },
  });
}

export async function beginCreateFromUri(uri: string, type: 'image' | 'video') {
  await goPreview(uri, type);
}

function assetType(asset: ImagePicker.ImagePickerAsset): 'image' | 'video' {
  if (asset.type === 'video') return 'video';
  if (asset.mimeType?.startsWith('video/')) return 'video';
  if (/\.(mp4|mov|m4v)$/i.test(asset.uri)) return 'video';
  return 'image';
}

/**
 * กล้องระบบของ iPhone — สลับโหมดรูป / วิดีโอได้
 * ยกเลิกแล้วค่อยเปิดคลังภาพ (มีทั้งรูปและคลิป)
 */
export async function captureFromDeviceCamera(): Promise<'captured' | 'canceled' | 'denied'> {
  if (isIosSimulator()) {
    Alert.alert('ซิมูเลเตอร์ไม่มีกล้อง', 'เลือกจากคลังภาพแทนได้');
    useCreateStudioStore.getState().open();
    return 'denied';
  }
  if (busy) return 'canceled';
  busy = true;
  useCreateStudioStore.getState().close();
  useMusicPlayerStore.getState().pause();
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์กล้อง', 'กรุณาอนุญาตให้ BoomMall ใช้กล้องเพื่อถ่ายคอนเทนต์');
      useCreateStudioStore.getState().open();
      return 'denied';
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: 60,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
      cameraType: ImagePicker.CameraType.back,
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
    });
    if (result.canceled || !result.assets[0]) {
      useCreateStudioStore.getState().open();
      return 'canceled';
    }
    const asset = result.assets[0];
    await goPreview(asset.uri, assetType(asset));
    return 'captured';
  } catch (e) {
    Alert.alert('เปิดกล้องไม่ได้', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    useCreateStudioStore.getState().open();
    return 'denied';
  } finally {
    busy = false;
  }
}

/** Tab กล้อง — เปิดกล้อง iPhone เต็มจอทันที ไม่ดึงคลังรูปมาทับ */
export function openIPhoneCameraFromCreate() {
  void captureFromDeviceCamera();
}
