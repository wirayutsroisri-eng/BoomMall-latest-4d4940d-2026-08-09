import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SharedValue } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { beginCreateFromUri, captureFromDeviceCamera } from '@/modules/create/data/openDeviceCapture';
import { DevicePhotoGrid } from '@/shared/media/DevicePhotoGrid';

type Props = {
  onClose?: () => void;
  scrollY?: SharedValue<number>;
};

/** คลังภาพ — เปิดเมื่อผู้ใช้เลือกเอง ไม่ถูกดึงตอนกดแท็บกล้อง */
export function CameraStudioScreen({ onClose, scrollY }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.close}
          onPress={() => {
            if (onClose) onClose();
            else if (router.canGoBack()) router.back();
          }}
          hitSlop={8}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title}>คลังภาพ</Text>
        <View style={{ width: 44 }} />
      </View>
      <DevicePhotoGrid
        showCameraTile
        includeVideos
        scrollY={scrollY}
        onPressCamera={() => {
          void captureFromDeviceCamera();
        }}
        onPick={(uri, type) => {
          void beginCreateFromUri(uri, type);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
