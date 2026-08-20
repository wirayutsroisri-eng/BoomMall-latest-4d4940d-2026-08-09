import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  CameraView,
  type CameraType,
  type FlashMode,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';
import { cameraPreviewRatioProp } from '@/modules/create/domain/cameraPreviewLayout';

export type CaptureMode = 'photo' | 'video15' | 'video60';

export type LiveCameraHandle = {
  takePhoto: () => Promise<string | null>;
  startRecording: (maxDuration: number) => Promise<string | null>;
  stopRecording: () => void;
};

type Props = {
  active: boolean;
  facing: CameraType;
  flash: FlashMode;
  mode: CaptureMode;
  recording: boolean;
  style?: StyleProp<ViewStyle>;
  onReady: () => void;
  onMountError: (message: string) => void;
  onPermissionChange: (granted: boolean) => void;
};

/** Isolated expo-camera preview — letterboxed contain layout, 1x zoom, full sensor capture. */
export const CreateCaptureLiveCamera = forwardRef<LiveCameraHandle, Props>(function CreateCaptureLiveCamera(
  { active, facing, flash, mode, recording, style, onReady, onMountError, onPermissionChange },
  ref,
) {
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [, requestMicPermission] = useMicrophonePermissions();

  useEffect(() => {
    void requestCameraPermission();
  }, [requestCameraPermission]);

  useEffect(() => {
    if (cameraPermission == null) return;
    onPermissionChange(cameraPermission.granted);
  }, [cameraPermission, onPermissionChange]);

  useImperativeHandle(ref, () => ({
    takePhoto: async () => {
      try {
        const photo = await cameraRef.current?.takePictureAsync({
          quality: 1,
          skipProcessing: false,
        });
        return photo?.uri ?? null;
      } catch {
        return null;
      }
    },
    startRecording: async (maxDuration: number) => {
      if (!cameraRef.current) return null;
      try {
        await requestMicPermission();
        const result = await cameraRef.current.recordAsync({ maxDuration });
        return result?.uri ?? null;
      } catch {
        return null;
      }
    },
    stopRecording: () => {
      try {
        cameraRef.current?.stopRecording();
      } catch {
        /* noop */
      }
    },
  }));

  if (!cameraPermission?.granted) return null;

  return (
    <View style={[styles.fill, style]}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={facing === 'front' ? 'off' : flash}
        mode={mode === 'photo' && !recording ? 'picture' : 'video'}
        active={active}
        mirror={facing === 'front'}
        zoom={0}
        ratio={Platform.OS === 'android' ? cameraPreviewRatioProp(mode) : undefined}
        onCameraReady={onReady}
        onMountError={(e) => onMountError(e.message)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
});
