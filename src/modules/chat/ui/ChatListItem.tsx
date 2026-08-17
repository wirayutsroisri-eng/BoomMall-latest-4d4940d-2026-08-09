import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Conversation } from '@/modules/chat/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { chatInboxPalette } from './chatDayNight';

type Props = {
  item: Conversation;
  onLongPress?: (item: Conversation) => void;
};

export function ChatListItem({ item, onLongPress }: Props) {
  const isGroup = item.kind === 'group';
  const palette = chatInboxPalette();

  const handleLongPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.(item);
  };

  return (
    <Pressable
      style={styles.row}
      onPress={() => jumpToChatThread(item.id)}
      onLongPress={handleLongPress}
      delayLongPress={350}
    >
      <View style={[styles.avatarWrap, item.unread > 0 && styles.avatarUnreadRing]}>
        <Avatar
          uri={item.avatarUri}
          initial={item.peerName.slice(0, 1)}
          backgroundColor={item.avatarColor}
          size={52}
          radius={16}
          borderWidth={0}
        />
        {item.isPinned ? (
          <View style={[styles.pinBadge, { backgroundColor: palette.pinBadgeBg, borderColor: palette.groupDotBorder }]}>
            <Text style={styles.pinBadgeText}>📌</Text>
          </View>
        ) : null}
        {isGroup ? (
          <View style={[styles.groupDot, { borderColor: palette.groupDotBorder }]}>
            <Ionicons name="people" size={10} color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={[styles.name, { color: palette.name }]} numberOfLines={1}>
            {item.isHidden ? '🔒 ' : ''}
            {item.peerName}
          </Text>
          <Text style={[styles.time, { color: palette.time }]}>{item.updatedAt}</Text>
        </View>
        <View style={styles.previewRow}>
          <Text style={[styles.preview, { color: palette.preview }]} numberOfLines={1}>
            {isGroup ? `👥 ${item.memberCount ?? 0} · ` : ''}
            {item.lastMessage}
          </Text>
          {item.isMuted ? (
            <Ionicons name="notifications-off" size={13} color={palette.muteIcon} />
          ) : null}
          {item.unread > 0 && !item.isMuted ? <View style={styles.unreadDot} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  avatarWrap: {
    position: 'relative',
    borderRadius: 18,
    padding: 2,
  },
  /** ยังไม่อ่าน — วงเขียวบางๆ รอบโปรไฟล์ */
  avatarUnreadRing: {
    borderWidth: 2,
    borderColor: colors.brand.primary,
    padding: 0,
  },
  pinBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    zIndex: 2,
  },
  pinBadgeText: {
    fontSize: 8,
    lineHeight: 10,
    textAlign: 'center',
  },
  groupDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  body: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontWeight: '800',
    fontSize: 15,
  },
  time: {
    fontSize: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  preview: {
    flex: 1,
  },
  /** จุดฟ้าเล็กๆ แทนเลขแจ้งเตือน */
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.info,
  },
});
