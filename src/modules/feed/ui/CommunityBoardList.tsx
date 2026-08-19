import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { BoardSide, FeedItem } from '@/modules/feed/domain/types';
import { IOS_SPRING, clampPagerX, snapPagerIndex } from './feedMotion';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import { buildBoardList } from '@/modules/matching/domain/board-list';
import {
  boardCategoryLabel,
  categoryGlyph,
} from '@/modules/matching/domain/board-side';
import { extractJobKeywords } from '@/modules/matching/domain/extract-keywords';
import { useBoardUiStore } from '@/modules/matching/state/board-ui-store';
import { colors } from '@/shared/theme/colors';
import { Avatar } from '@/shared/components/Avatar';
import { safePush } from '@/shared/navigation/safeNavigate';

type Props = {
  items: FeedItem[];
  topInset: number;
  onOpenPost: (feedId: string) => void;
  pagerX?: SharedValue<number>;
  screenWidth?: number;
  tabCount?: number;
  onCommitTabIndex?: (index: number) => void;
};

const TABS: Array<{ key: BoardSide; label: string }> = [
  { key: 'demand', label: 'หาช่าง/หาคนช่วย' },
  { key: 'supply', label: 'รับงาน/เสนอบริการ' },
];

/** width/height — 4:5 ตั้ง, 16:9 นอน, ไม่ดึง 9:16 ยาวเกินกริดร้าน */
const ASPECT_PORTRAIT = 4 / 5;
const ASPECT_LANDSCAPE = 16 / 9;

function clampMediaAspect(width?: number, height?: number): number {
  if (!width || !height || width <= 0 || height <= 0) return ASPECT_PORTRAIT;
  const ratio = width / height;
  return Math.min(ASPECT_LANDSCAPE, Math.max(ASPECT_PORTRAIT, ratio));
}

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
  const title =
    item.product.name?.trim() ||
    item.caption.split('\n')[0]?.trim() ||
    (side === 'supply' ? `รับ${category}` : `หาคน${category}`);
  const glyph = categoryGlyph(extractJobKeywords(item.caption).categories[0]);
  const hasPhoto = Boolean(item.imageUri);
  const [aspect, setAspect] = useState(() =>
    clampMediaAspect(item.imageWidth, item.imageHeight),
  );

  useEffect(() => {
    if (item.imageWidth && item.imageHeight) {
      setAspect(clampMediaAspect(item.imageWidth, item.imageHeight));
      return;
    }
    if (!item.imageUri) {
      setAspect(ASPECT_PORTRAIT);
      return;
    }
    Image.getSize(
      item.imageUri,
      (w, h) => setAspect(clampMediaAspect(w, h)),
      () => setAspect(ASPECT_PORTRAIT),
    );
  }, [item.id, item.imageUri, item.imageWidth, item.imageHeight]);

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
    jumpToChatThread(conversationId);
  };

  const priceLabel =
    item.product.basePrice > 0
      ? `฿${item.product.basePrice.toLocaleString('th-TH')}`
      : 'สอบถาม';

  return (
    <Pressable
      style={[styles.tile, { width }]}
      onPress={() => {
        void Haptics.selectionAsync();
        onOpenPost(item.id);
      }}
    >
      <View style={[styles.media, { aspectRatio: aspect }]}>
        {hasPhoto ? (
          <Image source={{ uri: item.imageUri }} style={styles.mediaFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={item.gradient} style={styles.mediaFill}>
            <Text style={styles.glyph}>{glyph}</Text>
          </LinearGradient>
        )}
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>
            {distanceKm != null ? `${distanceKm.toFixed(1)} กม.` : item.location}
          </Text>
        </View>
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price} numberOfLines={1}>
            {priceLabel}
          </Text>
          <Pressable
            style={styles.chatBtn}
            onPress={openChat}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="แชท"
          >
            <Ionicons name="chatbubble" size={16} color={colors.brand.primary} />
          </Pressable>
        </View>
        <View style={styles.authorRow}>
          <Avatar
            uri={`https://i.pravatar.cc/150?u=boommall-${item.authorHandle.replace(/^@/, '').toLowerCase()}`}
            initial={item.author.slice(0, 1)}
            size={22}
            radius={11}
            borderWidth={0}
          />
          <Text style={styles.author} numberOfLines={1}>
            {item.author}
          </Text>
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
      </View>
    </Pressable>
  );
}

/**
 * Community Board — 2-column marketplace grid with demand/supply tabs.
 */
export function CommunityBoardList({
  items,
  topInset,
  onOpenPost,
  pagerX,
  screenWidth,
  tabCount = 1,
  onCommitTabIndex,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const side = useBoardUiStore((s) => s.side);
  const setSide = useBoardUiStore((s) => s.setSide);
  const gap = 10;
  const pad = 12;
  const pageW = screenWidth ?? winW;
  const tileW = (pageW - pad * 2 - gap) / 2;
  const widthSV = useSharedValue(pageW);
  const tabCountSV = useSharedValue(tabCount);
  const panStartPagerX = useSharedValue(0);
  const draggingTabs = useSharedValue(0);

  useEffect(() => {
    widthSV.value = pageW;
  }, [pageW, widthSV]);

  useEffect(() => {
    tabCountSV.value = tabCount;
  }, [tabCount, tabCountSV]);

  const commitTab = (index: number) => {
    onCommitTabIndex?.(index);
  };

  const settlePager = (vx: number) => {
    'worklet';
    if (!pagerX) return;
    const w = widthSV.value;
    const pages = tabCountSV.value;
    const idx = snapPagerIndex(pagerX.value, w, pages, vx);
    pagerX.value = withSpring(-idx * w, { ...IOS_SPRING, velocity: vx });
    draggingTabs.value = 0;
    runOnJS(commitTab)(idx);
  };

  const horizontalSwipe = Gesture.Pan()
    .enabled(Boolean(pagerX))
    .activeOffsetX([-12, 12])
    .failOffsetY([-22, 22])
    .onStart(() => {
      if (!pagerX) return;
      panStartPagerX.value = pagerX.value;
      draggingTabs.value = 0;
    })
    .onUpdate((e) => {
      if (!pagerX) return;
      const w = widthSV.value;
      const pages = tabCountSV.value;
      const dx = e.translationX;
      if (dx < -10 || dx > 10) {
        draggingTabs.value = 1;
        pagerX.value = clampPagerX(panStartPagerX.value + dx, w, pages);
      } else {
        draggingTabs.value = 0;
        pagerX.value = panStartPagerX.value;
      }
    })
    .onEnd((e) => {
      if (!pagerX) return;
      if (draggingTabs.value === 1) {
        settlePager(e.velocityX);
        return;
      }
      pagerX.value = withSpring(panStartPagerX.value, IOS_SPRING);
    });

  const rows = useMemo(() => buildBoardList(items, undefined, side), [items, side]);

  return (
    <GestureDetector gesture={horizontalSwipe}>
    <View style={styles.root}>
      <View style={[styles.stickyHeader, { paddingTop: topInset + 52 }]}>
        <Text style={styles.introTitle}>หางาน</Text>
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

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="clipboard-outline" size={36} color={colors.text.muted} />
          <Text style={styles.emptyTitle}>
            {side === 'demand' ? 'ยังไม่มีโพสต์หาช่าง' : 'ยังไม่มีบัตรรับงาน'}
          </Text>
            <Text style={styles.emptySub}>
              {side === 'demand'
                ? 'กด “+ ประกาศหางาน” เพื่อลงประกาศ — ระบบจับคู่ข้ามแท็บให้อัตโนมัติ'
                : 'กดกล้องด้านล่างเพื่อลงบัตรรับงาน — ระบบจับคู่เมื่อมีคนหางานใกล้คุณ'}
            </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: pad,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 16) + 96,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.masonry}>
            <View style={[styles.masonryCol, { width: tileW, gap }]}>
              {rows.filter((_, i) => i % 2 === 0).map((row) => (
                <BoardTile key={row.item.id} row={row} width={tileW} onOpenPost={onOpenPost} />
              ))}
            </View>
            <View style={[styles.masonryCol, { width: tileW, gap }]}>
              {rows.filter((_, i) => i % 2 === 1).map((row) => (
                <BoardTile key={row.item.id} row={row} width={tileW} onOpenPost={onOpenPost} />
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {side === 'demand' ? (
        <Pressable
          style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 12 }]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            safePush({
              pathname: '/board-create',
              params: { side: 'demand', locked: '1' },
            });
          }}
        >
          <Ionicons name="add" size={22} color={colors.brand.ink} />
          <Text style={styles.fabText}>+ ประกาศหางาน</Text>
        </Pressable>
      ) : null}
    </View>
    </GestureDetector>
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
  masonry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  masonryCol: {
    flexGrow: 0,
  },
  tile: {
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
  },
  media: {
    width: '100%',
    backgroundColor: '#E8EEEA',
    position: 'relative',
  },
  mediaFill: {
    ...{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 42,
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
  tileBody: {
    padding: 8,
    gap: 4,
  },
  tileTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 16,
    minHeight: 32,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  price: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: colors.brand.primaryDark,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  author: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  chatBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
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
