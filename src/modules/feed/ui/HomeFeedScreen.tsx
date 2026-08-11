import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { StatusBar } from 'expo-status-bar';
import { router, useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useCallStore } from '@/modules/chat/state/call-store';
import type { FeedItem, FeedTab } from '@/modules/feed/domain/types';
import { selectFeedByTab } from '@/modules/feed/domain/selectFeedByTab';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { FeedHeader } from './FeedHeader';
import { FeedReelCard } from './FeedReelCard';
import { CommunityBoardList } from './CommunityBoardList';
import { ProductBottomSheet } from './ProductBottomSheet';
import { CommentsBottomSheet } from './CommentsBottomSheet';
import { usePresenceSession } from '@/modules/chat/ui/usePresenceSession';
import { MatchingNotifyBanner } from '@/modules/matching/ui/MatchingNotifyBanner';
import { colors } from '@/shared/theme/colors';
import { ENABLE_CALLS, ENABLE_FEED_COIN_REACTION } from '@/shared/compliance/appStoreGates';
import { ReportBlockSheet } from '@/modules/safety/ui/ReportBlockSheet';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { SocialLoginGate } from '@/modules/auth/ui/SocialLoginGate';
import { IOS_SPRING } from './feedMotion';

/** ซ้าย → ขวา (reel pager): ใกล้คุณ | กำลังติดตาม | สำหรับคุณ — เว็บบอร์ดแยก UI */
const TAB_ORDER: FeedTab[] = ['nearby', 'following', 'foryou'];

function openCreatorRoute(handle: string, feedId?: string) {
  const h = handle.replace(/^@/, '');
  if (!h) return;
  const q = feedId ? `?feedId=${encodeURIComponent(feedId)}` : '';
  router.push(`/creator/${encodeURIComponent(h)}${q}`);
}

export function HomeFeedScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const feedFocused = useIsFocused();
  const tab = useFeedStore((s) => s.tab);
  const allItems = useFeedStore((s) => s.items);
  const followingMap = useFollowStore((s) => s.following);
  const setTab = useFeedStore((s) => s.setTab);
  const tipClip = useFeedStore((s) => s.tipClip);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const activeProductId = useFeedStore((s) => s.activeProductId);
  const openProductSheet = useFeedStore((s) => s.openProductSheet);
  const openComments = useFeedStore((s) => s.openComments);
  const activeCommentsFeedId = useFeedStore((s) => s.activeCommentsFeedId);
  const startCall = useCallStore((s) => s.startCall);
  const setActive = useCallStore((s) => s.setActive);

  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<FeedItem | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const onBoard = tab === 'board';
  const blockedUserIds = useModerationStore((s) => s.blockedUserIds);
  const hiddenContentIds = useModerationStore((s) => s.hiddenContentIds);
  const removedContentIds = useModerationStore((s) => s.removedContentIds);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authHydrated = useAuthStore((s) => s.hydrated);

  /** กำลังดูคลิปในฟีด → heartbeat ออนไลน์ (ขอบเขียวโมเมนต์ของเรา) */
  usePresenceSession('feed', feedFocused && !onBoard && Boolean(activeItemId));
  const sheetRef = useRef<BottomSheetModal>(null);
  const commentsSheetRef = useRef<BottomSheetModal>(null);
  const activeIndexRef = useRef(0);
  const reelTab = onBoard ? 'foryou' : tab;
  const tabIndex = Math.max(0, TAB_ORDER.indexOf(reelTab));
  const pagerX = useSharedValue(-tabIndex * screenWidth);

  const feedsByTab = useMemo(() => {
    const blocked = new Set(blockedUserIds.map((id) => id.toLowerCase()));
    const suppressed = new Set([...hiddenContentIds, ...removedContentIds]);
    const map = {} as Record<FeedTab, FeedItem[]>;
    for (const t of [...TAB_ORDER, 'board'] as FeedTab[]) {
      map[t] = selectFeedByTab(allItems, t, followingMap).filter((item) => {
        if (suppressed.has(item.id)) return false;
        const handle = item.authorHandle.replace(/^@/, '').toLowerCase();
        return !blocked.has(handle) && !blocked.has(item.authorHandle.toLowerCase());
      });
    }
    return map;
  }, [allItems, followingMap, blockedUserIds, hiddenContentIds, removedContentIds]);

  const items = feedsByTab[reelTab] ?? [];
  const boardItems = feedsByTab.board ?? [];

  const pagerStyle = useAnimatedStyle(() => ({
    flex: 1,
    width: screenWidth * TAB_ORDER.length,
    flexDirection: 'row',
    transform: [{ translateX: pagerX.value }],
  }));

  const activeProduct = useMemo(() => {
    const item = allItems.find((i) => i.product.id === activeProductId);
    return item?.product ?? null;
  }, [activeProductId, allItems]);

  const activeCommentsItem = useMemo(
    () => allItems.find((i) => i.id === activeCommentsFeedId) ?? null,
    [activeCommentsFeedId, allItems],
  );

  useEffect(() => {
    setActiveItemId(items[0]?.id ?? null);
    activeIndexRef.current = 0;
  }, [tab, items]);

  useEffect(() => {
    const i = Math.max(0, TAB_ORDER.indexOf(tab));
    pagerX.value = -i * screenWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- width sync only
  }, [screenWidth]);

  const activeTabRef = useRef(tab);
  activeTabRef.current = tab;

  const onViewableItemsChangedByLane = useMemo(() => {
    const handlers = {} as Record<FeedTab, (info: { viewableItems: ViewToken[] }) => void>;
    for (const laneTab of TAB_ORDER) {
      handlers[laneTab] = ({ viewableItems }) => {
        if (activeTabRef.current !== laneTab) return;
        if (viewableItems[0]?.index != null) {
          activeIndexRef.current = viewableItems[0].index;
          const id = viewableItems[0].item?.id as string | undefined;
          if (id) setActiveItemId(id);
        }
      };
    }
    return handlers;
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const openCommentsSheet = useCallback(
    (feedId: string) => {
      if (authHydrated && !isAuthenticated()) {
        setLoginOpen(true);
        return;
      }
      openComments(feedId);
      requestAnimationFrame(() => commentsSheetRef.current?.present());
    },
    [authHydrated, isAuthenticated, openComments],
  );

  const openProduct = useCallback(
    (productId: string) => {
      openProductSheet(productId);
      requestAnimationFrame(() => sheetRef.current?.present());
    },
    [openProductSheet],
  );

  /** Empty feed coin — increments reaction count only (no wallet / no value) */
  const tipOneCoin = useCallback(
    (item: FeedItem) => {
      if (!ENABLE_FEED_COIN_REACTION) return;
      tipClip(item.id, 1);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [tipClip],
  );

  const openProfile = useCallback((item: FeedItem) => {
    if (item.isUserPost) {
      router.push('/(tabs)/profile');
      return;
    }
    openCreatorRoute(item.authorHandle, item.id);
  }, []);

  const commitTabIndex = useCallback(
    (index: number) => {
      const next = TAB_ORDER[index];
      if (!next || next === tab) return;
      void Haptics.selectionAsync();
      setTab(next);
    },
    [setTab, tab],
  );

  const openAuthor = useCallback(
    (item: FeedItem) => {
      openProfile(item);
    },
    [openProfile],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== viewportHeight) setViewportHeight(h);
  };

  const renderLaneItem = useCallback(
    (laneTab: FeedTab, item: FeedItem) => (
      <FeedReelCard
        item={item}
        height={viewportHeight}
        isActive={laneTab === tab && item.id === activeItemId}
        onTip={ENABLE_FEED_COIN_REACTION ? () => tipOneCoin(item) : undefined}
        onComment={() => openCommentsSheet(item.id)}
        onVaultSave={() => toggleSave(item.id)}
        onShare={() => Alert.alert('แชร์', `แชร์คลิปของ ${item.author}`)}
        onReport={
          item.isUserPost
            ? undefined
            : () => {
                void Haptics.selectionAsync();
                setReportTarget(item);
              }
        }
        onAvatar={() => openAuthor(item)}
        onProduct={() => openProduct(item.product.id)}
        onCall={
          ENABLE_CALLS
            ? () => {
                startCall(item.author, 'voice');
                setTimeout(() => setActive(), 900);
              }
            : undefined
        }
        enableProfileSwipe={laneTab === 'foryou' && !item.isUserPost}
        enableTabSwipeLeft={laneTab !== 'foryou'}
        screenWidth={screenWidth}
        tabCount={TAB_ORDER.length}
        pagerX={pagerX}
        onOpenProfile={() => openProfile(item)}
        onCommitTabIndex={commitTabIndex}
      />
    ),
    [
      activeItemId,
      commitTabIndex,
      openAuthor,
      openCommentsSheet,
      openProduct,
      openProfile,
      pagerX,
      screenWidth,
      setActive,
      startCall,
      tab,
      tipOneCoin,
      toggleSave,
      viewportHeight,
    ],
  );

  return (
    <View style={[styles.root, onBoard && styles.rootBoard]} onLayout={onLayout}>
      <StatusBar style={onBoard ? 'dark' : 'light'} />
      <View style={[styles.feedClip, onBoard && styles.feedClipBoard]}>
        {onBoard ? (
          <CommunityBoardList
            items={boardItems}
            topInset={insets.top}
            onOpenPost={openCommentsSheet}
          />
        ) : (
          <Animated.View style={pagerStyle}>
            {TAB_ORDER.map((laneTab) => {
              const laneItems = feedsByTab[laneTab] ?? [];
              return (
                <View key={laneTab} style={{ width: screenWidth, flex: 1 }}>
                  {viewportHeight > 0 ? (
                    <FlatList
                      data={laneItems}
                      keyExtractor={(item) => `${laneTab}:${item.id}`}
                      renderItem={({ item }) => renderLaneItem(laneTab, item)}
                      pagingEnabled
                      scrollEnabled={laneTab === tab}
                      decelerationRate="fast"
                      showsVerticalScrollIndicator={false}
                      snapToInterval={viewportHeight}
                      snapToAlignment="start"
                      disableIntervalMomentum
                      windowSize={laneTab === tab ? 3 : 1}
                      maxToRenderPerBatch={laneTab === tab ? 2 : 1}
                      initialNumToRender={1}
                      removeClippedSubviews
                      getItemLayout={(_, index) => ({
                        length: viewportHeight,
                        offset: viewportHeight * index,
                        index,
                      })}
                      onViewableItemsChanged={onViewableItemsChangedByLane[laneTab]}
                      viewabilityConfig={viewabilityConfig}
                    />
                  ) : null}
                </View>
              );
            })}
          </Animated.View>
        )}

        <FeedHeader
          tab={tab}
          onChangeTab={(next) => {
            void Haptics.selectionAsync();
            setTab(next);
            if (next === 'board') return;
            const i = TAB_ORDER.indexOf(next);
            if (i < 0) return;
            pagerX.value = withSpring(-i * screenWidth, IOS_SPRING);
          }}
          onPressSearch={() => router.push('/search')}
        />
      </View>

      <ProductBottomSheet
        ref={sheetRef}
        product={activeProduct}
        onCheckout={(variant, qty, total) => {
          sheetRef.current?.dismiss();
          Alert.alert(
            'ยังไม่พร้อมชำระเงิน',
            `${variant.label} × ${qty}\nยอดโดยประมาณ ฿${total.toLocaleString('th-TH')}\n\nยังไม่มีการเรียกเก็บเงิน — รอเชื่อม Payment Gateway`,
          );
        }}
      />

      <CommentsBottomSheet
        ref={commentsSheetRef}
        feedId={activeCommentsFeedId}
        commentCount={activeCommentsItem?.comments ?? 0}
      />

      <ReportBlockSheet
        visible={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        kind="content"
        targetId={reportTarget?.id ?? ''}
        targetLabel={reportTarget ? `${reportTarget.author} · ${reportTarget.caption.slice(0, 40)}` : undefined}
        blockUserId={reportTarget?.authorHandle.replace(/^@/, '')}
      />

      <SocialLoginGate
        visible={loginOpen || (authHydrated && !isAuthenticated() && feedFocused)}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={() => setLoginOpen(false)}
      />

      <MatchingNotifyBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.ink,
  },
  rootBoard: {
    backgroundColor: colors.surface.canvas,
  },
  feedClip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.brand.ink,
  },
  feedClipBoard: {
    backgroundColor: colors.surface.canvas,
  },
});
