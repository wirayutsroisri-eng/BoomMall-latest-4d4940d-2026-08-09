import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type {
  EditorMedia,
  OverlayObject,
} from '@/modules/create/domain/editorComposition';

export type NativeMediaEditorInput = {
  mediaId: string;
  uri: string;
  mediaType: EditorMedia['type'];
  overlays: OverlayObject[];
  crop?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
  };
  duration?: number;
};

export type NativeMediaEditorResult = {
  status: 'done' | 'cancel';
  mediaId: string;
  editedMediaURI: string;
  overlays: OverlayObject[];
  crop?: NativeMediaEditorInput['crop'];
  duration?: number;
};

type NativeMediaEditorModule = {
  openEditor(inputJSON: string): Promise<string>;
};

const nativeModule = Platform.OS === 'ios'
  ? requireOptionalNativeModule<NativeMediaEditorModule>('BoomMallNativeMediaEditor')
  : null;

/** Off by default until native-device QA is complete. */
export const nativeMediaEditorEnabled =
  process.env.EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED === 'true';

export function canOpenNativeMediaEditor(): boolean {
  return nativeMediaEditorEnabled && nativeModule != null;
}

export async function openNativeMediaEditor(
  input: NativeMediaEditorInput,
): Promise<NativeMediaEditorResult> {
  if (!canOpenNativeMediaEditor() || !nativeModule) {
    throw new Error('BoomMall native media editor is unavailable or disabled');
  }
  const raw = await nativeModule.openEditor(JSON.stringify(input));
  return JSON.parse(raw) as NativeMediaEditorResult;
}
