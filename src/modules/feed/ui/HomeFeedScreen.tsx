import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { selectFeedByTab, pinPromotedFeedItems } from '@/modules/feed/domain/selectFeedByTab';
import { CHANTHABURI } from '@/modules/matching/domain/geo';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { resolveShopMaster } from '@/modules/shop/domain/product-display';
import { SellerNotifyBanner } from '@/modules/store/ui/SellerNotifyBanner';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { FeedHeader } from './FeedHeader';
import { FeedReelCard } from './FeedReelCard';
import { FeedLongPressSheet } from './FeedLongPressSheet';
import { FeedShareSheet } from './FeedShareSheet';
import { CommunityBoardList } from './CommunityBoardList';
import { ProductBottomSheet } from './ProductBottomSheet';
import { CommentsBottomSheet } from './CommentsBottomSheet';
import { usePresenceSession } from '@/modules/chat/ui/usePresenceSession';
import { MatchingNotifyBanner } from '@/modules/matching/ui/MatchingNotifyBanner';
import { colors } from '@/shared/theme/colors';
import { ENABLE_CALLS } from '@/shared/compliance/appStoreGates';
import { ReportBlockSheet } from '@/modules/safety/ui/ReportBlockSheet';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { SocialLoginGate } from '@/modules/auth/ui/SocialLoginGate';
import { IOS_SPRING } from './feedMotion';
import { useFeedChromeStore } from '@/modules/feed/state/feed-chrome-store';
import { syncFeedInterested, syncFeedLike, syncFeedNotInterested, syncFeedShare } from '@/modules/feed/data/feedEngageApi';
import { recordActivity } from '@/modules/account/state/activity-store';

/** ซ้าย → ขวา ตามหัวแท็บ: หางาน | ใกล้คุณ | กำลังติดตาม | สำหรับคุณ */
const TAB_ORDER: FeedTab[] = ['board', 'nearby', 'following', 'foryou'];

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
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const bumpShare = useFeedStore((s) => s.bumpShare);
  const activeProductId = useFeedStore((s) => s.activeProductId);
  const openProductSheet = useFeedStore((s) => s.openProductSheet);
  const openComments = useFeedStore((s) => s.openComments);
  const activeCommentsFeedId = useFeedStore((s) => s.activeCommentsFeedId);
  const startCall = useCallStore((s) => s.startCall);
  const setActive = useCallStore((s) => s.setActive);

  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<FeedItem | null>(null);
  const [menuItem, setMenuItem] = useState<FeedItem | null>(null);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const onBoard = tab === 'board';
  const blockedUserIds = useModerationStore((s) => s.blockedUserIds);
  const hiddenContentIds = useModerationStore((s) => s.hiddenContentIds);
  const removedContentIds = useModerationStore((s) => s.removedContentIds);
  const hideContent = useModerationStore((s) => s.hideContent);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const chromeHidden = useFeedChromeStore((s) => s.chromeHidden);
  const autoAdvance = useFeedChromeStore((s) => s.autoAdvance);
  const playbackRate = useFeedChromeStore((s) => s.playbackRate);

  /** กำลังดูคลิปในฟีด → heartbeat ออนไลน์ (ขอบเขียวโมเมนต์ของเรา) */
  usePresenceSession('feed', feedFocused && !onBoard && Boolean(activeItemId));
  const sheetRef = useRef<BottomSheetModal>(null);
  const commentsSheetRef = useRef<BottomSheetModal>(null);
  const activeIndexRef = useRef(0);
  const listRefs = useRef<Partial<Record<FeedTab, FlatList<FeedItem> | null>>>({});
  const reelTab = onBoard ? 'foryou' : tab;
  const tabIndex = Math.max(0, TAB_ORDER.indexOf(tab));
  const pagerX = useSharedValue(-tabIndex * screenWidth);

  const promotedMasters = useInventoryStore((s) => s.masters);
  const promotedIds = useMemo(
    () => new Set(promotedMasters.filter((m) => m.isPromoted).map((m) => m.id)),
    [promotedMasters],
  );

  const feedsByTab = useMemo(() => {
    const blocked = new Set(blockedUserIds.map((id) => id.toLowerCase()));
    const suppressed = new Set([...hiddenContentIds, ...removedContentIds]);
    const map = {} as Record<FeedTab, FeedItem[]>;
    for (const t of TAB_ORDER) {
      const lane = selectFeedByTab(allItems, t, followingMap, CHANTHABURI, 10).filter((item) => {
        if (suppressed.has(item.id)) return false;
        const handle = item.authorHandle.replace(/^@/, '').toLowerCase();
        return !blocked.has(handle) && !blocked.has(item.authorHandle.toLowerCase());
      });
      map[t] = t === 'foryou' ? pinPromotedFeedItems(lane, promotedIds) : lane;
    }
    return map;
  }, [allItems, followingMap, blockedUserIds, hiddenContentIds, removedContentIds, promotedIds]);

  const items = feedsByTab[reelTab] ?? [];
  const boardItems = feedsByTab.board ?? [];
  const allItemsRef = useRef(allItems);
  allItemsRef.current = allItems;

  useEffect(() => {
    if (!activeItemId) return;
    const timer = setTimeout(() => {
      const item = allItemsRef.current.find((i) => i.id === activeItemId);
      if (!item) return;
      recordActivity({
        category: 'watch',
        title: item.caption?.trim() || item.product?.name || 'คลิป',
        subtitle: item.author,
        targetId: item.id,
      });
    }, 2800);
    return () => clearTimeout(timer);
  }, [activeItemId]);

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
      if (laneTab === 'board') continue;
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

  const likeClip = useCallback(
    (item: FeedItem) => {
      if (authHydrated && !isAuthenticated()) {
        setLoginOpen(true);
        return;
      }
      const nextLiked = !item.liked;
      toggleLike(item.id);
      void syncFeedLike(item.id, nextLiked);
    },
    [authHydrated, isAuthenticated, toggleLike],
  );

  const openLongPressMenu = useCallback((item: FeedItem) => {
    setMenuItem(item);
  }, []);

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

  useEffect(() => {
    if (!autoAdvance || onBoard || !activeItemId || viewportHeight <= 0) return;
    const idx = items.findIndex((i) => i.id === activeItemId);
    if (idx < 0 || idx >= items.length - 1) return;
    const ms = Math.max(2800, Math.round(15000 / playbackRate));
    const t = setTimeout(() => {
      listRefs.current[reelTab]?.scrollToIndex({ index: idx + 1, animated: true });
    }, ms);
    return () => clearTimeout(t);
  }, [autoAdvance, playbackRate, activeItemId, onBoard, items, reelTab, viewportHeight]);

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
        onComment={() => openCommentsSheet(item.id)}
        onShare={() => setShareItem(item)}
        onLike={() => likeClip(item)}
        liked={item.liked}
        likes={item.likes}
        onLongPressMenu={() => openLongPressMenu(item)}
        onAvatar={() => openAuthor(item)}
        onProduct={
          resolveShopMaster(item.product, promotedMasters)
            ? () => openProduct(item.product.id)
            : undefined
        }
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
      likeClip,
      openAuthor,
      openCommentsSheet,
      openLongPressMenu,
      openProduct,
      openProfile,
      pagerX,
      promotedMasters,
      screenWidth,
      setActive,
      startCall,
      tab,
      viewportHeight,
    ],
  );

  return (
    <View style={[styles.root, onBoard && styles.rootBoard]} onLayout={onLayout}>
      <StatusBar style={onBoard ? 'dark' : 'light'} />
      <View style={[styles.feedClip, onBoard && styles.feedClipBoard]}>
        <Animated.View style={pagerStyle}>
          {TAB_ORDER.map((laneTab) => {
            if (laneTab === 'board') {
              return (
                <View key={laneTab} style={{ width: screenWidth, flex: 1 }}>
                  <CommunityBoardList
                    items={boardItems}
                    topInset={insets.top}
                    onOpenPost={openCommentsSheet}
                    pagerX={pagerX}
                    screenWidth={screenWidth}
                    tabCount={TAB_ORDER.length}
                    onCommitTabIndex={commitTabIndex}
                  />
                </View>
              );
            }
            const laneItems = feedsByTab[laneTab] ?? [];
            return (
              <View key={laneTab} style={{ width: screenWidth, flex: 1 }}>
                {viewportHeight > 0 ? (
                  <FlatList
                    ref={(node) => {
                      listRefs.current[laneTab] = node;
                    }}
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

        {!chromeHidden || onBoard ? (
          <FeedHeader
            tab={tab}
            onChangeTab={(next) => {
              void Haptics.selectionAsync();
              setTab(next);
              const i = TAB_ORDER.indexOf(next);
              if (i < 0) return;
              pagerX.value = withSpring(-i * screenWidth, IOS_SPRING);
            }}
            onPressSearch={() => router.push('/search')}
            onPressMore={
              onBoard
                ? undefined
                : () => {
                    const item = items.find((i) => i.id === activeItemId) ?? items[0];
                    if (!item) return;
                    void Haptics.selectionAsync();
                    openLongPressMenu(item);
                  }
            }
          />
        ) : null}
      </View>

      <ProductBottomSheet ref={sheetRef} product={activeProduct} />

      <CommentsBottomSheet
        ref={commentsSheetRef}
        feedId={activeCommentsFeedId}
        commentCount={activeCommentsItem?.comments ?? 0}
      />

      <FeedLongPressSheet
        visible={Boolean(menuItem)}
        item={menuItem}
        canReport={Boolean(menuItem) && !menuItem?.isUserPost}
        saved={Boolean(menuItem?.saved)}
        onClose={() => setMenuItem(null)}
        onInterested={() => {
          if (!menuItem) return;
          void syncFeedInterested(menuItem.id);
          setMenuItem(null);
        }}
        onNotInterested={() => {
          if (!menuItem) return;
          hideContent(menuItem.id);
          void syncFeedNotInterested(menuItem.id);
          setMenuItem(null);
        }}
        onSave={() => {
          if (!menuItem) return;
          toggleSave(menuItem.id);
          setMenuItem(null);
        }}
        onReport={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target || target.isUserPost) return;
          setTimeout(() => setReportTarget(target), 280);
        }}
        onShare={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target) return;
          setTimeout(() => setShareItem(target), 280);
        }}
      />

      <FeedShareSheet
        visible={Boolean(shareItem)}
        item={shareItem}
        onClose={() => setShareItem(null)}
        onShared={(item) => {
          bumpShare(item.id);
          void syncFeedShare(item.id);
        }}
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
      <SellerNotifyBanner />
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
