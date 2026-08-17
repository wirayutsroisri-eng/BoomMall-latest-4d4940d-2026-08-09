import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

type Props = {
  visible: boolean;
  displayName: string;
  handle: string;
  onClose: () => void;
};

/** Current-user QR card. Closable by drag-down or the X. */
export function MyQrSheet({ visible, displayName, handle, onClose }: Props) {
  const label = handle.replace(/^@/, '') || displayName || 'boommall';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="ปิด" />
          <DragDownDismiss onDismiss={onClose} style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text style={styles.title}>QR Code ของฉัน</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="ปิด">
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </Pressable>
            </View>
            <View style={styles.card}>
              <View style={styles.qrFrame}>
                <Ionicons name="qr-code" size={148} color={colors.brand.ink} />
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {displayName || 'BoomMall'}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{label}
              </Text>
              <Text style={styles.hint}>ให้เพื่อนหรือร้านค้าสแกนเพื่อเริ่มแชท</Text>
            </View>
          </DragDownDismiss>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,20,15,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 36,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontWeight: '900',
    fontSize: 16,
    color: colors.text.primary,
  },
  card: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  qrFrame: {
    width: 188,
    height: 188,
    borderRadius: 20,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  name: {
    fontWeight: '900',
    fontSize: 17,
    color: colors.text.primary,
  },
  handle: {
    marginTop: 4,
    color: colors.text.secondary,
    fontWeight: '700',
    fontSize: 13,
  },
  hint: {
    marginTop: 10,
    color: colors.text.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});
