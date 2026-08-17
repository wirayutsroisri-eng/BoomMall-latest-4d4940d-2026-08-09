import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { USER_ACTIVITY_CATEGORIES, ACTIVITY_CATEGORY_META } from '@/modules/account/domain/types';
import { useActivityStore } from '@/modules/account/state/activity-store';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';
import { colors } from '@/shared/theme/colors';
import { SettingsRow, SettingsSection } from './SettingsPrimitives';

export function ActivityCenterScreen() {
  const insets = useSafeAreaInsets();
  const entries = useActivityStore((s) => s.entries);
  const clearAll = useActivityStore((s) => s.clearAll);
  const musicCount = useMusicLibraryStore((s) => s.watchHistory.length);
  const clearMusic = useMusicLibraryStore((s) => s.clearWatchHistory);

  const counts = useMemo(() => {
    const map: Record<string, number> = { music: musicCount };
    for (const e of entries) {
      if (e.category === 'shop' || e.subtitle === 'สินค้า') continue;
      map[e.category] = (map[e.category] ?? 0) + 1;
    }
    return map;
  }, [entries, musicCount]);

  const userEntries = entries.filter((e) => e.category !== 'shop' && e.subtitle !== 'สินค้า');
  const total = userEntries.length + musicCount;

  const onClearAll = () => {
    if (!total) {
      Alert.alert('ไม่มีประวัติ', 'ยังไม่มีรายการให้ลบ');
      return;
    }
    Alert.alert('ลบประวัติทั้งหมด?', `จะลบ ${total} รายการจากทุกหัวข้อ ไม่สามารถกู้คืนได้`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          clearAll();
          clearMusic();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>ศูนย์กิจกรรม</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48 }}>
        <Text style={styles.lead}>
          ประวัติโปรไฟล์ผู้ใช้เท่านั้น — รับชม ค้นหาเพื่อน เพลง และแชต
          โมดูลร้านค้าอยู่ที่แท็บร้านในหน้าโปรไฟล์ แยกระบบจัดการกัน
        </Text>

        <SettingsSection title="ประวัติโปรไฟล์" />
        {USER_ACTIVITY_CATEGORIES.map((key) => {
          const meta = ACTIVITY_CATEGORY_META[key];
          const count = counts[key] ?? 0;
          return (
            <SettingsRow
              key={key}
              icon={meta.icon}
              title={meta.title}
              subtitle={`${meta.subtitle} · ${count} รายการ`}
              onPress={() =>
                router.push({ pathname: '/settings/history/[category]', params: { category: key } })
              }
            />
          );
        })}

        <SettingsSection title="จัดการประวัติ" />
        <Pressable style={styles.deleteBtn} onPress={onClearAll}>
          <Ionicons name="trash-outline" size={18} color={colors.brand.pink} />
          <Text style={styles.deleteText}>ลบประวัติทั้งหมด</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  lead: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(254,44,85,0.1)',
    borderRadius: 14,
    paddingVertical: 14,
  },
  deleteText: { color: colors.brand.pink, fontWeight: '900', fontSize: 15 },
});
