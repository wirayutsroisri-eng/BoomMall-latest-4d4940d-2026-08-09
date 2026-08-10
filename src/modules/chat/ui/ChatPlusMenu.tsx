import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreateGroup: () => void;
  onAddFriend: () => void;
  onStartCall: () => void;
  onQuotation: () => void;
};

const ITEMS: Array<{
  key: 'group' | 'friend' | 'call' | 'quotation';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { key: 'group', icon: 'people', label: 'สร้างกลุ่มใหม่ / Group Chat' },
  { key: 'friend', icon: 'person-add', label: 'เพิ่มเพื่อน / สแกน QR Code' },
  { key: 'call', icon: 'call', label: 'เริ่มการโทร / HD Video Call' },
  { key: 'quotation', icon: 'receipt', label: 'ออกใบเสนอราคา / Smart Quotation Card' },
];

/** LINE-style Popover Menu anchored under the [+] button in the Super Chat Engine header. */
export function ChatPlusMenu({
  visible,
  onClose,
  onCreateGroup,
  onAddFriend,
  onStartCall,
  onQuotation,
}: Props) {
  const insets = useSafeAreaInsets();

  const handlers: Record<(typeof ITEMS)[number]['key'], () => void> = {
    group: onCreateGroup,
    friend: onAddFriend,
    call: onStartCall,
    quotation: onQuotation,
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
