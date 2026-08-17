import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';

export type ChatPlusAction = 'group' | 'scanQr' | 'myQr' | 'newChat' | 'markAllRead';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
  onScanQr: () => void;
  onMyQr: () => void;
  onNewChat: () => void;
  onMarkAllRead: () => void;
};

const ITEMS: Array<{
  key: ChatPlusAction;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { key: 'group', icon: 'people', label: 'สร้างกลุ่มใหม่' },
  { key: 'scanQr', icon: 'scan', label: 'สแกน QR Code' },
  { key: 'myQr', icon: 'qr-code', label: 'QR Code ของฉัน' },
  { key: 'newChat', icon: 'chatbubble-ellipses', label: 'แชทใหม่' },
  { key: 'markAllRead', icon: 'checkmark-done', label: 'อ่านทั้งหมดแล้ว' },
];

/** LINE-style popover under the inbox [+] button. */
export function ChatPlusMenu({
  visible,
  onClose,
  onCreateGroup,
  onScanQr,
  onMyQr,
  onNewChat,
  onMarkAllRead,
}: Props) {
  const insets = useSafeAreaInsets();

  const handlers: Record<ChatPlusAction, () => void> = {
    group: onCreateGroup,
    scanQr: onScanQr,
    myQr: onMyQr,
    newChat: onNewChat,
    markAllRead: onMarkAllRead,
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.panel, { top: insets.top + 52 }]}>
          {ITEMS.map((item, i) => (
            <Pressable
              key={item.key}
              style={[styles.row, i < ITEMS.length - 1 && styles.rowDivider]}
              onPress={() => {
                onClose();
                handlers[item.key]();
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={17} color={colors.brand.ink} />
              </View>
              <Text style={styles.label}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,20,15,0.28)',
  },
  panel: {
    position: 'absolute',
    right: 16,
    width: 258,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    color: colors.text.primary,
    fontWeight: '700',
    fontSize: 13,
  },
});
