import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import type { Conversation } from '@/modules/chat/domain/types';

type Props = {
  visible: boolean;
  conversation: Conversation | null;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
};

/**
 * Long-press quick-action sheet for a chat row — LINE/WeChat-style bottom sheet
 * with pin / mute / archive / mark-as-read / delete shortcuts.
 */
export function ChatItemActionSheet({
  visible,
  conversation,
  onClose,
  onTogglePin,
  onToggleMute,
  onArchive,
  onMarkRead,
  onDelete,
}: Props) {
  if (!conversation) return null;

  const items: Array<{
    key: string;
    icon: string;
    label: string;
    destructive?: boolean;
    onPress: () => void;
  }> = [
    {
      key: 'pin',
      icon: '📌',
      label: conversation.isPinned ? 'เลิกปักหมุดแชต' : 'ปักหมุดแชต',
      onPress: () => onTogglePin(conversation.id),
    },
    {
      key: 'mute',
      icon: '🔕',
      label: conversation.isMuted ? 'เปิดเสียงแจ้งเตือน' : 'ปิดเสียง',
      onPress: () => onToggleMute(conversation.id),
    },
    {
      key: 'archive',
      icon: '📥',
      label: 'ซ่อน / จัดเก็บ',
      onPress: () => onArchive(conversation.id),
    },
    {
      key: 'read',
      icon: '👁️',
      label: 'ทำเครื่องหมายว่าอ่านแล้ว',
      onPress: () => onMarkRead(conversation.id),
    },
    {
      key: 'delete',
      icon: '🗑️',
      label: 'ลบแชต',
      destructive: true,
      onPress: () => onDelete(conversation.id),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Avatar
              initial={conversation.peerName.slice(0, 1)}
              backgroundColor={conversation.avatarColor}
              size={38}
              radius={13}
            />
            <Text style={styles.headerName} numberOfLines={1}>
              {conversation.peerName}
            </Text>
          </View>

          {items.map((item, i) => (
            <Pressable
              key={item.key}
              style={[styles.row, i < items.length - 1 && styles.rowDivider]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              <Text style={styles.rowIcon}>{item.icon}</Text>
              <Text style={[styles.rowLabel, item.destructive && styles.rowLabelDestructive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,20,15,0.36)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 30,
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
    gap: 10,
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  headerName: {
    flex: 1,
    fontWeight: '900',
    fontSize: 15,
    color: colors.text.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  rowIcon: {
    fontSize: 18,
    width: 22,
    textAlign: 'center',
  },
  rowLabel: {
    fontWeight: '700',
    fontSize: 14,
    color: colors.text.primary,
  },
  rowLabelDestructive: {
    color: colors.accent.live,
  },
});
