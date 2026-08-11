import React, { useMemo } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { BoardSide, FeedItem } from '@/modules/feed/domain/types';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { buildBoardList } from '@/modules/matching/domain/board-list';
import {
  boardCategoryLabel,
  boardTitlePrefix,
  categoryGlyph,
  formatBoardBudget,
} from '@/modules/matching/domain/board-side';
import { extractJobKeywords } from '@/modules/matching/domain/extract-keywords';
import { useBoardUiStore } from '@/modules/matching/state/board-ui-store';
import { colors } from '@/shared/theme/colors';
import { safePush } from '@/shared/navigation/safeNavigate';

type Props = {
  items: FeedItem[];
  topInset: number;
  onOpenPost: (feedId: string) => void;
};

const TABS: Array<{ key: BoardSide; label: string }> = [
  { key: 'demand', label: 'หาช่าง/หาคนช่วย' },
  { key: 'supply', label: 'รับงาน/เสนอบริการ' },
];

function BoardTile({
  row,
  width,
  onOpenPost,
}: {
  row: ReturnType<typeof buildBoardList>[number];
  width: number;
  onOpenPost: (feedId: string) => void;
}) {
  const startConversationWithCreator = useChatStore((s) => s.startConversationWithCreator);
  const { item, skills, distanceKm, side } = row;
  const category = boardCategoryLabel(item);
  const title = item.caption.split('\n')[0]?.trim() || item.product.name;
  const budget = formatBoardBudget(item.product.basePrice);
  const cats = extractJobKeywords(item.caption).categories;
  const glyph = categoryGlyph(cats[0]);
  const hasPhoto = Boolean(item.imageUri);

  const openChat = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const conversationId = startConversationWithCreator(
      item.author,
      item.authorHandle,
      item.gradient[0],
      {
        id: `cref-${item.id}`,
        feedId: item.id,
        title,
        subtitle: item.caption,
        price: item.product.basePrice,
        currency: 'THB',
        tier: item.product.tier,
        imageUri: item.imageUri,
        gradient: item.gradient,
        authorHandle: item.authorHandle,
      },
    );
    router.push(`/(tabs)/chat/${encodeURIComponent(conversationId)}`);
  };

  return (
    <Pressable
      style={[styles.tile, { width }]}
      onPress={() => {
        void Haptics.selectionAsync();
        onOpenPost(item.id);
      }}
    >
      <View style={styles.media}>
        {hasPhoto ? (
          <Image source={{ uri: item.imageUri }} style={styles.mediaFill} />
        ) : (
          <LinearGradient colors={item.gradient} style={styles.mediaFill}>
            <Text style={styles.glyph}>{glyph}</Text>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={styles.mediaShade}
        />
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>
            📍 {distanceKm != null ? `${distanceKm.toFixed(1)} กม.` : item.location}
          </Text>
        </View>
        <View style={styles.overlayCopy}>
          <Text style={styles.overlayTitle} numberOfLines={2}>
            {boardTitlePrefix(side)} {side === 'supply' ? `รับ${category}` : `หาคน${category}`}
          </Text>
          <Text style={styles.overlaySub} numberOfLines={2}>
            {title}
          </Text>
          {budget ? (
            <View style={styles.budgetTag}>
              <Text style={styles.budgetTagText}>{budget}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.tileFooter}>
        <Text style={styles.author} numberOfLines={1}>
          {item.author}
        </Text>
        <Pressable style={styles.chatBtn} onPress={openChat}>
          <Text style={styles.chatBtnText}>💬 ทักแชท</Text>
        </Pressable>
      </View>
      {skills.length > 0 ? (
        <View style={styles.skillRow}>
          {skills.slice(0, 2).map((s) => (
            <View key={s} style={styles.skillChip}>
              <Text style={styles.skillText}>{s}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Community Board — 2-column marketplace grid with demand/supply tabs.
 */
export function CommunityBoardList({ items, topInset, onOpenPost }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const side = useBoardUiStore((s) => s.side);
  const setSide = useBoardUiStore((s) => s.setSide);
  const gap = 10;
  const pad = 12;
  const tileW = (winW - pad * 2 - gap) / 2;

  const rows = useMemo(() => buildBoardList(items, undefined, side), [items, side]);

  return (
    <View style={styles.root}>
      <View style={[styles.stickyHeader, { paddingTop: topInset + 52 }]}>
        <Text style={styles.introTitle}>เว็บบอร์ดชุมชน</Text>
        <Text style={styles.introSub}>
          จันทบุรี · บูมบอทจับคู่ข้ามแท็บตามรัศมี GPS ที่คุณตั้ง
        </Text>
        <View style={styles.tabRow}>
          {TABS.map((tab) => {
            const active = side === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSide(tab.key);
                }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={rows}
        key={side}
        keyExtractor={(row) => row.item.id}
        numColumns={2}
        columnWrapperStyle={{ gap, paddingHorizontal: pad }}
        contentContainerStyle={{
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 16) + 96,
          gap,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={36} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>
              {side === 'demand' ? 'ยังไม่มีโพสต์หาช่าง' : 'ยังไม่มีบัตรรับงาน'}
            </Text>
            <Text style={styles.emptySub}>
              กด “+ โพสต์” เพื่อลงประกาศ — ระบบจับคู่ข้ามแท็บให้อัตโนมัติ
            </Text>
          </View>
        }
        renderItem={({ item: row }) => (
          <BoardTile row={row} width={tileW} onOpenPost={onOpenPost} />
        )}
      />

      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 12 }]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          safePush({
            pathname: '/board-create',
            params: { side, locked: '1' },
          });
        }}
      >
        <Ionicons name="add" size={22} color={colors.brand.ink} />
        <Text style={styles.fabText}>
          {side === 'demand' ? '+ ประกาศหางาน' : '+ รับงาน'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  stickyHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: colors.surface.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
    gap: 4,
  },
  introTitle: {
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  introSub: {
    color: colors.text.secondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(10,22,17,0.06)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.brand.ink,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.secondary,
  },
  tabTextActive: {
    color: colors.brand.primary,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontWeight: '800',
    fontSize: 16,
  },
  emptySub: {
    color: colors.text.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  tile: {
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  media: {
    height: 148,
    position: 'relative',
  },
  mediaFill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 42,
  },
  mediaShade: {
    ...StyleSheet.absoluteFill,
  },
  distanceBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  distanceText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  overlayCopy: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    gap: 2,
  },
  overlayTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
  overlaySub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '600',
  },
  budgetTag: {
    marginTop: 2,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,214,10,0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  budgetTagText: {
    color: '#1A1408',
    fontSize: 11,
    fontWeight: '900',
  },
  tileFooter: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  },
  author: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.primary,
  },
  chatBtn: {
    backgroundColor: colors.brand.ink,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  chatBtnText: {
    color: colors.brand.primary,
    fontWeight: '900',
    fontSize: 12,
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  skillChip: {
    backgroundColor: colors.brand.mist,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  skillText: {
    color: colors.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: {
    color: colors.brand.ink,
    fontWeight: '900',
    fontSize: 14,
  },
});
