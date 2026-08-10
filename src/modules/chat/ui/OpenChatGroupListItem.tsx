import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { OpenChatGroup } from '@/modules/chat/domain/types';
import { colors } from '@/shared/theme/colors';

type Props = {
  item: OpenChatGroup;
};

export function OpenChatGroupListItem({ item }: Props) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/(tabs)/chat/group/${item.id}`)}
    >
      <View style={[styles.avatar, { backgroundColor: item.accent }]} />
      <View style={styles.body}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>
          {item.memberCount.toLocaleString('th-TH')} สมาชิก · {item.lastActivity}
        </Text>
      </View>
      <View style={[styles.pill, item.isJoined && styles.pillJoined]}>
        <Text style={[styles.pillText, item.isJoined && styles.pillTextJoined]}>
          {item.isJoined ? 'เข้าร่วมแล้ว' : 'เข้าร่วม'}
        </Text>
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
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  body: { flex: 1 },
  name: {
    fontWeight: '800',
    color: colors.text.primary,
  },
  meta: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.brand.ink,
  },
  pillJoined: {
    backgroundColor: colors.brand.mist,
  },
  pillText: {
    color: colors.brand.primary,
    fontWeight: '800',
    fontSize: 11,
  },
  pillTextJoined: {
    color: colors.brand.primaryDark,
  },
});
