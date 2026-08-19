import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  ACTIVITY_CATEGORY_META,
  type ActivityCategory,
} from '@/modules/account/domain/types';
import { useActivityStore } from '@/modules/account/state/activity-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { normalizeAuthorHandle } from '@/modules/feed/domain/selectFeedByAuthor';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';
import { useMusicPlayerStore } from '@/modules/music/state/music-player-store';
import { formatWatchAgo } from '@/modules/music/domain/format-views';
import { jumpToChatThread, openListenScreenNow } from '@/shared/navigation/safeNavigate';
import { colors } from '@/shared/theme/colors';

type Row = {
  id: string;
  title: string;
  subtitle?: string;
  at: string;
};

export function ActivityHistoryScreen({ category }: { category: ActivityCategory }) {
  const insets = useSafeAreaInsets();
  const meta = ACTIVITY_CATEGORY_META[category];
  const entries = useActivityStore((s) => s.entries);
  const remove = useActivityStore((s) => s.remove);
  const clearCategory = useActivityStore((s) => s.clearCategory);
  const watchHistory = useMusicLibraryStore((s) => s.watchHistory);
  const allTracks = useMusicLibraryStore((s) => s.allTracks);
  const removeWatchEntry = useMusicLibraryStore((s) => s.removeWatchEntry);
  const clearWatchHistory = useMusicLibraryStore((s) => s.clearWatchHistory);
  const playTrack = useMusicPlayerStore((s) => s.playTrack);

  const rows = useMemo<Row[]>(() => {
    if (category === 'music') {
      const catalog = allTracks();
      return watchHistory.map((h) => {
        const track = catalog.find((t) => t.id === h.trackId);
        return {
          id: h.id,
          title: track?.title ?? 'เพลง',
          subtitle: track?.artist,
          at: h.at,
        };
      });
    }
    return entries
      .filter((e) => e.category === category && e.subtitle !== 'สินค้า')

      .map((e) => ({ id: e.id, title: e.title, subtitle: e.subtitle, at: e.at }));
  }, [allTracks, category, entries, watchHistory]);

  const openRow = (row: Row) => {
    if (category === 'watch') {
      const entry = entries.find((e) => e.id === row.id);
      const item = useFeedStore.getState().items.find((i) => i.id === entry?.targetId);
      if (item) {
        router.push({
          pathname: '/profile-feed',
          params: { handle: normalizeAuthorHandle(item.authorHandle), startId: item.id },
        });
        return;
      }
    }
    if (category === 'chat') {
      const entry = entries.find((e) => e.id === row.id);
      if (entry?.targetId) {
        jumpToChatThread(entry.targetId);
        return;
      }
    }
    if (category === 'search') {
      router.push('/search');
      return;
    }
    if (category === 'music') {
      const hist = watchHistory.find((h) => h.id === row.id);
      const track = hist ? allTracks().find((t) => t.id === hist.trackId) : undefined;
      if (track) {
        openListenScreenNow();
        void playTrack(track, [track]);
      }
    }
  };

  const confirmRemove = (id: string, title: string) => {
    Alert.alert('ลบรายการนี้?', title, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          if (category === 'music') removeWatchEntry(id);
          else remove(id);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const confirmClear = () => {
    if (!rows.length) {
      Alert.alert('ไม่มีประวัติ', meta.empty);
      return;
    }
    Alert.alert(`ลบ${meta.title}?`, `จะลบ ${rows.length} รายการ ไม่สามารถกู้คืนได้`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          if (category === 'music') clearWatchHistory();
          else clearCategory(category);
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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {meta.title}
        </Text>
        <Pressable hitSlop={8} onPress={confirmClear} style={styles.clearBtn}>
          <Text style={styles.clearLink}>ลบทั้งหมด</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48 }}>
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name={meta.icon} size={36} color={colors.text.muted} />
            <Text style={styles.emptyText}>{meta.empty}</Text>
          </View>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.card}>
              <Pressable style={styles.cardBody} onPress={() => openRow(row)}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {row.title}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {[row.subtitle, formatWatchAgo(row.at)].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
              <Pressable
                style={styles.trash}
                onPress={() => confirmRemove(row.id, row.title)}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color={colors.brand.pink} />
              </Pressable>
            </View>
          ))
        )}
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
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  clearBtn: { minWidth: 72, alignItems: 'flex-end' },
  clearLink: { color: colors.brand.pink, fontWeight: '800', fontSize: 13 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontWeight: '800', color: colors.text.primary, fontSize: 15 },
  cardSub: { color: colors.text.muted, fontSize: 12, marginTop: 3 },
  trash: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(254,44,85,0.1)',
  },
  empty: { alignItems: 'center', paddingVertical: 72, gap: 10 },
  emptyText: { color: colors.text.muted, fontSize: 14, fontWeight: '700' },
});
