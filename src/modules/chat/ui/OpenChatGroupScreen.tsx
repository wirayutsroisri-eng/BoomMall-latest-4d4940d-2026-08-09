import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOpenChatStore } from '@/modules/chat/state/openchat-store';
import { colors } from '@/shared/theme/colors';

type Props = {
  groupId: string;
};

export function OpenChatGroupScreen({ groupId }: Props) {
  const insets = useSafeAreaInsets();
  const group = useOpenChatStore((s) => s.groups.find((g) => g.id === groupId));
  const toggleJoin = useOpenChatStore((s) => s.toggleJoin);

  if (!group) {
    return (
      <View style={styles.missing}>
        <Text>ไม่พบกลุ่ม</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        <Text style={styles.backText}>OpenChat</Text>
      </Pressable>

      <View style={[styles.hero, { backgroundColor: group.accent }]}>
        <Text style={styles.heroTitle}>{group.name}</Text>
        <Text style={styles.heroMeta}>
          {group.memberCount.toLocaleString('th-TH')} สมาชิก
        </Text>
      </View>

      <Text style={styles.desc}>{group.description}</Text>
      <Text style={styles.activity}>{group.lastActivity}</Text>

      <Pressable style={styles.join} onPress={() => toggleJoin(group.id)}>
        <Text style={styles.joinText}>
          {group.isJoined ? 'ออกจากกลุ่ม' : 'เข้าร่วมชุมชน'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
    paddingHorizontal: 16,
  },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backText: { fontWeight: '700', color: colors.text.primary },
  hero: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },
  heroTitle: {
    color: colors.brand.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  heroMeta: {
    marginTop: 6,
    color: 'rgba(7,20,15,0.7)',
    fontWeight: '700',
  },
  desc: {
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  activity: {
    color: colors.text.secondary,
    marginBottom: 20,
  },
  join: {
    backgroundColor: colors.brand.ink,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  joinText: {
    color: colors.brand.primary,
    fontWeight: '900',
    fontSize: 16,
  },
});
