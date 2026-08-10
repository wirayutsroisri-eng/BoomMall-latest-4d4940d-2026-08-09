import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Conversation } from '@/modules/chat/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';

type Props = {
  item: Conversation;
  onLongPress?: (item: Conversation) => void;
};

export function ChatListItem({ item, onLongPress }: Props) {
  const isOfficial = item.kind === 'official';
  const isGroup = item.kind === 'group';

  const handleLongPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.(item);
  };

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
      onLongPress={handleLongPress}
      delayLongPress={350}
    >
      <View style={styles.avatarWrap}>
        <Avatar
          initial={item.peerName.slice(0, 1)}
          backgroundColor={item.avatarColor}
          size={52}
          radius={16}
        />
        {item.isPinned ? (
          <View style={styles.pinBadge}>
            <Text style={styles.pinBadgeText}>📌</Text>
          </View>
        ) : null}
        {isOfficial ? (
          <View style={styles.officialDot}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        ) : null}
        {isGroup ? (
          <View style={styles.groupDot}>
            <Ionicons name="people" size={10} color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>
            {item.isHidden ? '🔒 ' : ''}
            {item.peerName}
          </Text>
          <Text style={styles.time}>{item.updatedAt}</Text>
        </View>
        <View style={styles.previewRow}>
          <Text style={styles.preview} numberOfLines={1}>
            {isGroup ? `👥 ${item.memberCount ?? 0} · ` : ''}
            {item.lastMessage}
          </Text>
          {item.isMuted ? (
            <Ionicons name="notifications-off" size={13} color={colors.text.muted} />
          ) : null}
        </View>
      </View>
      {item.unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
        </View>
      ) : null}
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
  },
  pinBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surface.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
    zIndex: 2,
  },
  pinBadgeText: {
    fontSize: 8,
    lineHeight: 10,
    textAlign: 'center',
  },
  officialDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent.info,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface.canvas,
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
    borderColor: colors.surface.canvas,
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
    color: colors.text.primary,
    fontSize: 15,
  },
  time: {
    color: colors.text.muted,
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
    color: colors.text.secondary,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.brand.ink,
    fontWeight: '900',
    fontSize: 12,
  },
});
