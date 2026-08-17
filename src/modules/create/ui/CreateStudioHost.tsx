import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { useCreateStudioStore } from '@/modules/create/state/create-studio-store';
import { CameraStudioScreen } from './CameraStudioScreen';

/** Optional in-app gallery overlay. The camera tab does not open this. */
export function CreateStudioHost() {
  const visible = useCreateStudioStore((s) => s.visible);
  const close = useCreateStudioStore((s) => s.close);
  const scrollY = useSharedValue(0);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <DragDownDismiss onDismiss={close} scrollY={scrollY} style={styles.sheet}>
        <CameraStudioScreen onClose={close} scrollY={scrollY} />
      </DragDownDismiss>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    backgroundColor: '#000',
  },
  sheet: { flex: 1 },
});
