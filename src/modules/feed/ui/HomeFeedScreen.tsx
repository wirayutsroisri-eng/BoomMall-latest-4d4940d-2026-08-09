import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Alert,
  InteractionManager,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { ContentRefreshOverlay } from '@/shared/components/ContentRefreshOverlay';
import { withMinimumDuration } from '@/shared/utils/minimumDuration';
import { useCallStore } from '@/modules/chat/state/call-store';
import type { FeedItem, FeedTab } from '@/modules/feed/domain/types';
import { selectFeedByTab, pinPromotedFeedItems } from '@/modules/feed/domain/selectFeedByTab';
import { CHANTHABURI } from '@/modules/matching/domain/geo';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { resolveShopMaster } from '@/modules/shop/domain/product-display';
import { SellerNotifyBanner } from '@/modules/store/ui/SellerNotifyBanner';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { FeedHeader } from './FeedHeader';
import { FeedReelCard } from './FeedReelCard';
import { FeedLongPressSheet } from './FeedLongPressSheet';
import { beginEditPostFromFeedItem } from '@/modules/create/data/beginEditPostFromFeed';
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
import { MediaViewer } from './MediaViewer';

/** ซ้าย → ขวา ตามหัวแท็บ: หางาน | ใกล้คุณ | กำลังติดตาม | สำหรับคุณ */
const TAB_ORDER: FeedTab[] = ['board', 'nearby', 'following', 'foryou'];

/** ความสูงแถบคอมเมนต์หน้าคลิป — seek bar วางบนขอบบนของบาร์นี้ */
const COMMENT_DOCK_PAD_TOP = 10;
const COMMENT_DOCK_ROW = 44;
const COMMENT_DOCK_MIN = 68;
/** `FeedSeekBar` ใช้ `bottom: 10 + bottomOffset` */
const SEEK_BAR_BASE_BOTTOM = 10;

function openCreatorRoute(handle: string, feedId?: string) {
  const h = handle.replace(/^@/, '');
  if (!h) return;
  const q = feedId ? `?feedId=${encodeURIComponent(feedId)}` : '';
  router.push(`/creator/${encodeURIComponent(h)}${q}`);
}

export function HomeFeedScreen({
  channelEmbedded = false,
  channelActive = true,
  renderMediaViewer = true,
  videoOnly = false,
  initialFeedId,
  initialPlaybackTime = 0,
  verticalScrollY,
}: {
  channelEmbedded?: boolean;
  channelActive?: boolean;
  renderMediaViewer?: boolean;
  videoOnly?: boolean;
  initialFeedId?: string;
  initialPlaybackTime?: number;
  verticalScrollY?: SharedValue<number>;
} = {}) {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const routeFocused = useIsFocused();
  const feedFocused = routeFocused && channelActive;
  const tab = useFeedStore((s) => s.tab);
  const allItems = useFeedStore((s) => s.items);
  const followingMap = useFollowStore((s) => s.following);
  const myHandle = useLoyaltyStore((s) => s.profile.handle);
  const setTab = useFeedStore((s) => s.setTab);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const deletePost = useFeedStore((s) => s.deletePost);
  const bumpShare = useFeedStore((s) => s.bumpShare);
  const activeProductId = useFeedStore((s) => s.activeProductId);
  const openProductSheet = useFeedStore((s) => s.openProductSheet);
  const openComments = useFeedStore((s) => s.openComments);
  const activeCommentsFeedId = useFeedStore((s) => s.activeCommentsFeedId);
  const startCall = useCallStore((s) => s.startCall);
  const setActive = useCallStore((s) => s.setActive);

  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [playbackActiveItemId, setPlaybackActiveItemId] = useState<string | null>(null);
  const [playbackTab, setPlaybackTab] = useState<FeedTab>(tab);
  const isScrollingRef = useRef(false);
  const [reportTarget, setReportTarget] = useState<FeedItem | null>(null);
  const [menuItem, setMenuItem] = useState<FeedItem | null>(null);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshFeed = useFeedStore((s) => s.refreshFromServer);
  const laneOrder = useMemo<FeedTab[]>(() => channelEmbedded ? ['foryou'] : TAB_ORDER, [channelEmbedded]);
  const effectiveTab: FeedTab = channelEmbedded ? 'foryou' : tab;
  const onBoard = !channelEmbedded && tab === 'board';
  /** Persist scroll position per tab so switching tabs retains the active item. */
  const activeItemByTabRef = useRef<Partial<Record<FeedTab, string | null>>>({});
  const blockedUserIds = useModerationStore((s) => s.blockedUserIds);
  const hiddenContentIds = useModerationStore((s) => s.hiddenContentIds);
  const removedContentIds = useModerationStore((s) => s.removedContentIds);
  const hideContent = useModerationStore((s) => s.hideContent);
  const removeContent = useModerationStore((s) => s.removeContent);
  const authenticated = useAuthStore((s) => Boolean(s.sessionToken && s.user));
  const authHydrated = useAuthStore((s) => s.hydrated);
  const chromeHidden = useFeedChromeStore((s) => s.chromeHidden);
  const autoAdvance = useFeedChromeStore((s) => s.autoAdvance);
  const mediaZoomed = useFeedChromeStore((s) => s.mediaZoomed);
  const playbackRate = useFeedChromeStore((s) => s.playbackRate);

  /** กำลังดูคลิปในฟีด → heartbeat ออนไลน์ (ขอบเขียวโมเมนต์ของเรา) */
  usePresenceSession('feed', feedFocused && !onBoard && Boolean(activeItemId));
  const sheetRef = useRef<BottomSheetModal>(null);
  const commentsSheetRef = useRef<BottomSheetModal>(null);
  const activeIndexRef = useRef(0);
  const listRefs = useRef<Partial<Record<FeedTab, FlatList<FeedItem> | null>>>({});
  const reelTab = onBoard ? 'foryou' : effectiveTab;
  const tabIndex = Math.max(0, laneOrder.indexOf(effectiveTab));
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
    for (const t of laneOrder) {
      const lane = selectFeedByTab(allItems, t, followingMap, CHANTHABURI, 10, myHandle).filter((item) => {
        if (suppressed.has(item.id)) return false;
        if (videoOnly && !item.videoUri) return false;
        const handle = item.authorHandle.replace(/^@/, '').toLowerCase();
        return !blocked.has(handle) && !blocked.has(item.authorHandle.toLowerCase());
      });
      const ordered = t === 'foryou' ? pinPromotedFeedItems(lane, promotedIds) : lane;
      if (videoOnly && initialFeedId) {
        const selectedIndex = ordered.findIndex((item) => item.id === initialFeedId);
        map[t] = selectedIndex > 0
          ? [ordered[selectedIndex]!, ...ordered.slice(0, selectedIndex), ...ordered.slice(selectedIndex + 1)]
          : ordered;
      } else {
        map[t] = ordered;
      }
    }
    return map;
  }, [allItems, followingMap, myHandle, blockedUserIds, hiddenContentIds, removedContentIds, promotedIds, laneOrder, videoOnly, initialFeedId]);

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
    width: screenWidth * laneOrder.length,
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
    // Restore the previously active item for this tab (persisted across tab switches).
    const restored = activeItemByTabRef.current[effectiveTab];
    const requested = initialFeedId && items.some((item) => item.id === initialFeedId) ? initialFeedId : null;
    const candidate = requested ?? (restored && items.find((i) => i.id === restored) ? restored : items[0]?.id ?? null);
    setActiveItemId(candidate);
    activeIndexRef.current = candidate ? items.findIndex((i) => i.id === candidate) : 0;
  }, [effectiveTab, initialFeedId, items]);

  // Save the active item whenever it changes, so we can restore it on tab switch.
  useEffect(() => {
    if (activeItemId) {
      activeItemByTabRef.current[effectiveTab] = activeItemId;
    }
  }, [activeItemId, effectiveTab]);

  // Synchronize playbackTab and playbackActiveItemId immediately when tab or activeItemId changes (Zero-Delay Playback)
  useEffect(() => {
    setPlaybackTab(effectiveTab);
    setPlaybackActiveItemId(activeItemId);
  }, [effectiveTab, activeItemId]);

  useEffect(() => {
    const i = Math.max(0, laneOrder.indexOf(effectiveTab));
    pagerX.value = -i * screenWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- width sync only
  }, [screenWidth, effectiveTab, laneOrder, pagerX]);

  const activeTabRef = useRef(effectiveTab);
  activeTabRef.current = effectiveTab;

  const onViewableItemsChangedByLane = useMemo(() => {
    const handlers = {} as Record<FeedTab, (info: { viewableItems: ViewToken[] }) => void>;
    for (const laneTab of laneOrder) {
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
  }, [laneOrder]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const openCommentsSheet = useCallback(
    (feedId: string) => {
      if (authHydrated && !authenticated) {
        setLoginOpen(true);
        return;
      }
      openComments(feedId);
      requestAnimationFrame(() => commentsSheetRef.current?.present());
    },
    [authHydrated, authenticated, openComments],
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
      if (authHydrated && !authenticated) {
        setLoginOpen(true);
        return;
      }
      const nextLiked = !item.liked;
      toggleLike(item.id);
      void syncFeedLike(item.id, nextLiked);
    },
    [authHydrated, authenticated, toggleLike],
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
      const next = laneOrder[index];
      if (!next || next === tab) return;
      void Haptics.selectionAsync();
      setTab(next);
    },
    [laneOrder, setTab, tab],
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
  const commentDockPadBottom = Math.max(insets.bottom, 10);
  const commentDockHeight = Math.max(
    COMMENT_DOCK_MIN,
    COMMENT_DOCK_PAD_TOP + COMMENT_DOCK_ROW + commentDockPadBottom,
  );
  const reelBottomInset = videoOnly ? 76 + insets.bottom : channelEmbedded ? 40 : 0;

  const renderLaneItem = useCallback(
    (laneTab: FeedTab, item: FeedItem) => (
      <FeedReelCard
        item={item}
        height={viewportHeight}
        isActive={laneTab === playbackTab && item.id === playbackActiveItemId}
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
        enableProfileSwipe={!channelEmbedded && laneTab === 'foryou' && !item.isUserPost}
        enableTabSwipeLeft={!channelEmbedded && laneTab !== 'foryou'}
        screenWidth={screenWidth}
        tabCount={laneOrder.length}
        pagerX={pagerX}
        onOpenProfile={() => openProfile(item)}
        onCommitTabIndex={commitTabIndex}
        bottomMetaInset={reelBottomInset}
        bottomActionsInset={reelBottomInset}
        bottomSeekInset={videoOnly ? commentDockHeight - SEEK_BAR_BASE_BOTTOM : channelEmbedded ? 5 : 0}
        initialPlaybackTime={videoOnly && item.id === initialFeedId ? initialPlaybackTime : 0}
      />
    ),
    [
      playbackActiveItemId,
      playbackTab,
      channelEmbedded,
      commitTabIndex,
      likeClip,
      openAuthor,
      openCommentsSheet,
      openLongPressMenu,
      openProduct,
      openProfile,
      pagerX,
      laneOrder.length,
      promotedMasters,
      commentDockHeight,
      reelBottomInset,
      initialFeedId,
      initialPlaybackTime,
      screenWidth,
      setActive,
      startCall,
      viewportHeight,
    ],
  );

  return (
    <View
      style={[
        styles.root,
        videoOnly && styles.rootVideo,
        channelEmbedded && !videoOnly && styles.rootEmbedded,
        onBoard && styles.rootBoard,
      ]}
      onLayout={onLayout}
    >
      <StatusBar style={onBoard ? 'dark' : 'light'} />
      <View style={[styles.feedClip, onBoard && styles.feedClipBoard]}>
        <Animated.View style={pagerStyle}>
          {laneOrder.map((laneTab) => {
            if (laneTab === 'board') {
              return (
                <View key={laneTab} style={{ width: screenWidth, flex: 1 }}>
                  {feedFocused ? (
                    <CommunityBoardList
                      items={boardItems}
                      topInset={insets.top}
                      onOpenPost={openCommentsSheet}
                      pagerX={pagerX}
                      screenWidth={screenWidth}
                      tabCount={laneOrder.length}
                      onCommitTabIndex={commitTabIndex}
                    />
                  ) : null}
                </View>
              );
            }
            const laneItems = feedsByTab[laneTab] ?? [];
            return (
              <View key={laneTab} style={{ width: screenWidth, flex: 1 }}>
                {feedFocused && viewportHeight > 0 ? (
                  laneItems.length === 0 ? (
                    <View style={[styles.emptyLane, { paddingTop: insets.top + 88 }]}>
                      <Text style={styles.emptyTitle}>ยังไม่มีโพสต์</Text>
                      <Text style={styles.emptySub}>แตะกล้องด้านล่างเพื่อถ่ายแล้วโพสต์ลงฟีด</Text>
                    </View>
                  ) : (
                  <FlatList
                    ref={(node) => {
                      listRefs.current[laneTab] = node;
                    }}
                    data={laneItems}
                    onScroll={verticalScrollY ? (event) => { verticalScrollY.value = event.nativeEvent.contentOffset.y; } : undefined}
                    scrollEventThrottle={verticalScrollY ? 16 : undefined}
                    keyExtractor={(item) => `${laneTab}:${item.id}`}
                    renderItem={({ item }) => renderLaneItem(laneTab, item)}
                    pagingEnabled
                    scrollEnabled={laneTab === effectiveTab && !mediaZoomed}
                    decelerationRate="fast"
                    bounces={!videoOnly}
                    alwaysBounceVertical={!videoOnly}
                    overScrollMode="never"
                    showsVerticalScrollIndicator={false}
                    snapToInterval={viewportHeight}
                    snapToAlignment="start"
                    disableIntervalMomentum
                    windowSize={laneTab === tab ? 2 : 1}
                    maxToRenderPerBatch={1}
                    initialNumToRender={1}
                    removeClippedSubviews
                    refreshControl={(
                      <RefreshControl
                        refreshing={refreshing}
                        tintColor={channelEmbedded ? '#FFFFFF' : colors.brand.primaryDark}
                        onRefresh={() => {
                          setRefreshing(true);
                          void withMinimumDuration(refreshFeed()).finally(() => setRefreshing(false));
                        }}
                      />
                    )}
                    getItemLayout={(_, index) => ({
                      length: viewportHeight,
                      offset: viewportHeight * index,
                      index,
                    })}
                    onViewableItemsChanged={onViewableItemsChangedByLane[laneTab]}
                    viewabilityConfig={viewabilityConfig}
                  />
                  )
                ) : null}
              </View>
            );
          })}
        </Animated.View>

        {!channelEmbedded && (!chromeHidden || onBoard) ? (
          <FeedHeader
            tab={tab}
            onChangeTab={(next) => {
              const i = laneOrder.indexOf(next);
              if (i < 0 || next === tab) return;
              // Header taps follow the same rule as swipes: animate the pure
              // viewport first, then commit active/focus state after 100% snap.
              pagerX.value = withSpring(
                -i * screenWidth,
                IOS_SPRING,
                (finished) => {
                  if (finished) runOnJS(commitTabIndex)(i);
                },
              );
            }}
            onPressSearch={() => router.push({ pathname: '/channel-search', params: { scope: 'feed_global' } })}
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

      {/* แถบคอมเมนต์หน้าคลิป — seek bar วางติดขอบบนของบาร์นี้ */}
      {videoOnly && activeItemId ? (
        <View
          style={[
            styles.commentDock,
            { paddingBottom: commentDockPadBottom },
          ]}
        >
          <Pressable
            style={styles.commentComposer}
            onPress={() => openCommentsSheet(activeItemId)}
            accessibilityRole="button"
            accessibilityLabel="แสดงความคิดเห็น"
          >
            <Text style={styles.commentPlaceholder}>แสดงความคิดเห็น</Text>
          </Pressable>
          <Pressable
            style={styles.commentTool}
            onPress={() => openCommentsSheet(activeItemId)}
            accessibilityLabel="เพิ่มอีโมจิ"
          >
            <Ionicons name="happy-outline" size={27} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.commentTool}
            onPress={() => openCommentsSheet(activeItemId)}
            accessibilityLabel="เพิ่ม GIF"
          >
            <Text style={styles.gifText}>GIF</Text>
          </Pressable>
        </View>
      ) : null}

      <ProductBottomSheet ref={sheetRef} product={activeProduct} />

      <CommentsBottomSheet
        ref={commentsSheetRef}
        feedId={activeCommentsFeedId}
        commentCount={activeCommentsItem?.comments ?? 0}
      />

      <FeedLongPressSheet
        visible={Boolean(menuItem)}
        item={menuItem}
        isOwnPost={Boolean(menuItem?.isUserPost)}
        canReport={Boolean(menuItem) && !menuItem?.isUserPost}
        saved={Boolean(menuItem?.saved)}
        onClose={() => setMenuItem(null)}
        onEditPost={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target?.isUserPost) return;
          beginEditPostFromFeedItem(target);
        }}
        onDeletePost={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target?.isUserPost) return;
          Alert.alert('ลบโพสต์นี้?', 'โพสต์จะถูกเอาออกถาวร', [
            { text: 'ยกเลิก', style: 'cancel' },
            {
              text: 'ลบ',
              style: 'destructive',
              onPress: async () => {
                if (await deletePost(target.id)) {
                  removeContent(target.id);
                  if (target.legacyLocalId) removeContent(target.legacyLocalId);
                } else {
                  Alert.alert('ลบโพสต์ไม่สำเร็จ', 'โพสต์ถูกนำกลับมาแล้ว กรุณาลองอีกครั้ง');
                }
              },
            },
          ]);
        }}
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
        visible={loginOpen}
        onClose={() => setLoginOpen(false)}
        onAuthenticated={() => setLoginOpen(false)}
      />

      <MatchingNotifyBanner />
      <SellerNotifyBanner />
      {renderMediaViewer ? <MediaViewer /> : null}
      <ContentRefreshOverlay visible={refreshing} dark />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.ink,
    paddingTop: 17,
  },
  rootVideo: { paddingTop: 0 },
  rootBoard: {
    backgroundColor: colors.surface.canvas,
  },
  rootEmbedded: {
    transform: [{ translateY: -40 }],
  },
  feedClip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.brand.ink,
  },
  feedClipBoard: {
    backgroundColor: colors.surface.canvas,
  },
  commentDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 24,
    minHeight: COMMENT_DOCK_MIN,
    paddingTop: COMMENT_DOCK_PAD_TOP,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(8,8,8,0.96)',
  },
  commentComposer: {
    flex: 1,
    minHeight: COMMENT_DOCK_ROW,
    borderRadius: 24,
    justifyContent: 'center',
    paddingHorizontal: 17,
    backgroundColor: '#202020',
  },
  commentPlaceholder: { color: 'rgba(255,255,255,0.72)', fontSize: 15 },
  commentTool: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  gifText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    borderWidth: 1.5,
    borderColor: '#fff',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  emptyLane: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
