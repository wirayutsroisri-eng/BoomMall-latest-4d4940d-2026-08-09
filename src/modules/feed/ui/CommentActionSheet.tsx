import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import type { FeedComment } from '@/modules/feed/domain/types';

type Props = {
  visible: boolean;
  comment: FeedComment | null;
  isOwn: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
};

export function CommentActionSheet({
  visible,
  comment,
  isOwn,
  onClose,
  onEdit,
  onDelete,
  onReport,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!comment) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} showDim rootInModal rootStyle={styles.dismissRoot}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <Text style={styles.preview} numberOfLines={2}>
            {comment.author}: {comment.text}
          </Text>

          <View style={styles.group}>
            {isOwn ? (
              <>
                <MenuRow
                  icon="create-outline"
                  label="แก้ไข"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onEdit();
                  }}
                />
                <View style={styles.divider} />
                <MenuRow
                  icon="trash-outline"
                  label="ลบ"
                  destructive
                  onPress={() => {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    onDelete();
                  }}
                />
              </>
            ) : (
              <MenuRow
                icon="flag-outline"
                label="รายงานความคิดเห็น"
                onPress={() => {
                  void Haptics.selectionAsync();
                  onReport();
                }}
              />
            )}
          </View>
        </View>
      </DragDownDismiss>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const tint = destructive ? colors.brand.pink : colors.text.primary;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={22} color={tint} />
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dismissRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#E9EBEE',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C5C7CB',
    marginBottom: 2,
  },
  preview: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    paddingHorizontal: 6,
  },
  group: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginLeft: 50,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  rowLabelDestructive: {
    color: colors.brand.pink,
  },
});
