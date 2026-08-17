import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { Conversation } from '@/modules/chat/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

type Props = {
  visible: boolean;
  contacts: Conversation[];
  onClose: () => void;
  onPick: (conversationId: string) => void;
  onAddFriend: () => void;
};

/** Inbox [+] → แชทใหม่: pick a 1:1 thread or add a friend. */
export function ContactPickerSheet({ visible, contacts, onClose, onPick, onAddFriend }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="ปิด" />
          <DragDownDismiss onDismiss={onClose} style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={styles.title}>แชทใหม่</Text>
            <Text style={styles.subtitle}>เลือกผู้ติดต่อเพื่อเริ่มบทสนทนา 1:1</Text>
            <FlatList
              data={contacts}
              keyExtractor={(c) => c.id}
              style={styles.list}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="people-outline" size={28} color={colors.text.muted} />
                  <Text style={styles.emptyText}>ยังไม่มีผู้ติดต่อ</Text>
                  <Pressable
                    style={styles.addFriendBtn}
                    onPress={() => {
                      onClose();
                      onAddFriend();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="เพิ่มเพื่อน"
                  >
                    <Ionicons name="person-add" size={16} color={colors.brand.ink} />
                    <Text style={styles.addFriendText}>เพิ่มเพื่อน</Text>
                  </Pressable>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    onPick(item.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`แชทกับ ${item.peerName}`}
                >
                  <Avatar
                    uri={item.avatarUri}
                    initial={item.peerName.slice(0, 1)}
                    backgroundColor={item.avatarColor}
                    size={44}
                    radius={14}
                  />
                  <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.peerName}
                    </Text>
                    {item.peerHandle ? (
                      <Text style={styles.handle} numberOfLines={1}>
                        {item.peerHandle}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
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
    paddingBottom: 30,
    maxHeight: '70%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: 12,
  },
  title: {
    fontWeight: '900',
    fontSize: 16,
    color: colors.text.primary,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 8,
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  meta: {
    flex: 1,
  },
  name: {
    fontWeight: '700',
    color: colors.text.primary,
    fontSize: 14,
  },
  handle: {
    marginTop: 2,
    color: colors.text.secondary,
    fontSize: 12,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.brand.primary,
  },
  addFriendText: {
    color: colors.brand.ink,
    fontWeight: '800',
    fontSize: 13,
  },
});
