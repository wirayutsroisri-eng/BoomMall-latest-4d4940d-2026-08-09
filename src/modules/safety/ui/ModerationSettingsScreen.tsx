import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { colors } from '@/shared/theme/colors';

/**
 * User-facing moderation settings — blocked accounts + report status (Guideline 1.2).
 */
export function ModerationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const blockedUserIds = useModerationStore((s) => s.blockedUserIds);
  const reports = useModerationStore((s) => s.reports);
  const hiddenContentIds = useModerationStore((s) => s.hiddenContentIds);
  const removedContentIds = useModerationStore((s) => s.removedContentIds);
  const unblockUser = useModerationStore((s) => s.unblockUser);
  const restoreContent = useModerationStore((s) => s.restoreContent);
  const resolveReport = useModerationStore((s) => s.resolveReport);
  const [tab, setTab] = useState<'blocked' | 'reports' | 'takedowns'>('blocked');

  const onUnblock = useCallback(
    (id: string) => {
      Alert.alert('ยกเลิกบล็อก?', id, [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ยกเลิกบล็อก',
          onPress: () => {
            unblockUser(id);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]);
    },
    [unblockUser],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.title}>ความปลอดภัยและ moderation</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['blocked', 'บัญชีที่บล็อก'],
            ['reports', 'รายงานของฉัน'],
            ['takedowns', 'เนื้อหาที่ถูกซ่อน'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.tab, tab === key && styles.tabOn]}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {tab === 'blocked' ? (
          blockedUserIds.length === 0 ? (
            <Text style={styles.empty}>ยังไม่มีบัญชีที่บล็อก</Text>
          ) : (
            blockedUserIds.map((id) => (
              <View key={id} style={styles.card}>
                <Text style={styles.cardTitle}>{id}</Text>
                <Pressable style={styles.action} onPress={() => onUnblock(id)}>
                  <Text style={styles.actionText}>ยกเลิกบล็อก</Text>
                </Pressable>
              </View>
            ))
          )
        ) : null}

        {tab === 'reports' ? (
          reports.length === 0 ? (
            <Text style={styles.empty}>ยังไม่มีรายงาน</Text>
          ) : (
            reports.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle}>{r.reason}</Text>
                <Text style={styles.cardSub}>
                  {r.kind} · {r.targetLabel ?? r.targetId} · {r.status}
                </Text>
                {r.status === 'open' ? (
                  <View style={styles.rowActions}>
                    <Pressable
                      style={styles.action}
                      onPress={() => {
                        resolveReport(r.id, 'hide_content');
                        Alert.alert('ซ่อนแล้ว', 'เนื้อหาถูกซ่อนจากฟีดของคุณ');
                      }}
                    >
                      <Text style={styles.actionText}>ซ่อน</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.action, styles.danger]}
                      onPress={() => {
                        resolveReport(r.id, 'remove_content');
                        Alert.alert('ลบจากมุมมองแล้ว', 'เนื้อหาจะไม่แสดงในฟีดของคุณ');
                      }}
                    >
                      <Text style={[styles.actionText, { color: '#DC2626' }]}>ลบ</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))
          )
        ) : null}

        {tab === 'takedowns' ? (
          [...hiddenContentIds, ...removedContentIds].length === 0 ? (
            <Text style={styles.empty}>ยังไม่มีรายการ</Text>
          ) : (
            <>
              {hiddenContentIds.map((id) => (
                <View key={`h-${id}`} style={styles.card}>
                  <Text style={styles.cardTitle}>{id}</Text>
                  <Text style={styles.cardSub}>สถานะ: ซ่อน (hide)</Text>
                  <Pressable style={styles.action} onPress={() => restoreContent(id)}>
                    <Text style={styles.actionText}>แสดงอีกครั้ง</Text>
                  </Pressable>
                </View>
              ))}
              {removedContentIds.map((id) => (
                <View key={`r-${id}`} style={styles.card}>
                  <Text style={styles.cardTitle}>{id}</Text>
                  <Text style={styles.cardSub}>สถานะ: ลบจากฟีด (delete)</Text>
                </View>
              ))}
            </>
          )
        ) : null}
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
    paddingBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, gap: 6 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: colors.brand.primaryDark },
  tabText: { fontSize: 11, fontWeight: '700', color: colors.text.secondary },
  tabTextOn: { color: '#fff' },
  empty: { color: colors.text.muted, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.soft,
    gap: 6,
  },
  cardTitle: { fontWeight: '800', color: colors.text.primary },
  cardSub: { fontSize: 12, color: colors.text.muted },
  action: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(10,22,17,0.06)',
  },
  danger: { backgroundColor: 'rgba(220,38,38,0.08)' },
  actionText: { fontWeight: '700', color: colors.brand.primaryDark, fontSize: 13 },
  rowActions: { flexDirection: 'row', gap: 8 },
});
