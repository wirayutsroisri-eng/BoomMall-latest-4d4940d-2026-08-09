import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Alert,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useSharedValue } from 'react-native-reanimated';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useFeedChromeStore } from '@/modules/feed/state/feed-chrome-store';
import { useCallStore } from '@/modules/chat/state/call-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { FeedReelCard } from '@/modules/feed/ui/FeedReelCard';
import { FeedLongPressSheet } from '@/modules/feed/ui/FeedLongPressSheet';
import { beginEditPostFromFeedItem } from '@/modules/create/data/beginEditPostFromFeed';
import { FeedShareSheet } from '@/modules/feed/ui/FeedShareSheet';
import { ProductBottomSheet } from '@/modules/feed/ui/ProductBottomSheet';
import { CommentsBottomSheet } from '@/modules/feed/ui/CommentsBottomSheet';
import { normalizeAuthorHandle } from '@/modules/feed/domain/selectFeedByAuthor';
import { buildOwnerFeedItems } from '@/modules/profile/data/buildOwnerFeedItems';
import type { FeedItem } from '@/modules/feed/domain/types';
import { colors } from '@/shared/theme/colors';
import { ENABLE_CALLS } from '@/shared/compliance/appStoreGates';
import { ReportBlockSheet } from '@/modules/safety/ui/ReportBlockSheet';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { resolveShopMaster } from '@/modules/shop/domain/product-display';
import { syncFeedInterested, syncFeedLike, syncFeedNotInterested, syncFeedShare } from '@/modules/feed/data/feedEngageApi';
import { recordActivity } from '@/modules/account/state/activity-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';

type Props = {
  handle: string;
  startId?: string;
};

/**
 * ฟีดแนวตั้งของเจ้าของโปรไฟล์เท่านั้น — กดจากกริดแล้วปัดต่อได้เฉพาะคลิปของคนนั้น
 */
export function ProfileFeedScreen({ handle, startId }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const storeItems = useFeedStore((s) => s.items);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const deletePost = useFeedStore((s) => s.deletePost);
  const bumpShare = useFeedStore((s) => s.bumpShare);
  const openComments = useFeedStore((s) => s.openComments);
  const openProductSheet = useFeedStore((s) => s.openProductSheet);
  const activeProductId = useFeedStore((s) => s.activeProductId);
  const activeCommentsFeedId = useFeedStore((s) => s.activeCommentsFeedId);
  const startCall = useCallStore((s) => s.startCall);
  const setActive = useCallStore((s) => s.setActive);
  const profile = useLoyaltyStore((s) => s.profile);
  const userId = useAuthStore((s) => s.user?.id);
  const hideContent = useModerationStore((s) => s.hideContent);
  const removeContent = useModerationStore((s) => s.removeContent);
  const hiddenContentIds = useModerationStore((s) => s.hiddenContentIds);
  const removedContentIds = useModerationStore((s) => s.removedContentIds);
  const chromeHidden = useFeedChromeStore((s) => s.chromeHidden);
  const autoAdvance = useFeedChromeStore((s) => s.autoAdvance);
  const playbackRate = useFeedChromeStore((s) => s.playbackRate);
  const masters = useInventoryStore((s) => s.masters);

  const myHandle = normalizeAuthorHandle(profile.handle);
  const ownerKey = normalizeAuthorHandle(handle);
  const isSelf = ownerKey === myHandle;

  const items = useMemo(() => {
    const suppressed = new Set([...hiddenContentIds, ...removedContentIds]);
    const built = buildOwnerFeedItems(ownerKey, storeItems, {
      isSelf,
      ownerUserId: isSelf ? userId : undefined,
      displayName: isSelf ? profile.displayName : undefined,
      requireMedia: false,
    }).filter((item) => !suppressed.has(item.id));
    if (!isSelf || !profile.displayName.trim()) return built;
    /** ให้ชื่อบนคลิปตรงกับชื่อโปรไฟล์เสมอ */
    return built.map((item) => ({
      ...item,
      author: profile.displayName,
      authorHandle: profile.handle.startsWith('@') ? profile.handle : `@${ownerKey}`,
    }));
  }, [ownerKey, storeItems, isSelf, userId, profile.displayName, profile.handle, hiddenContentIds, removedContentIds]);

  const initialIndex = useMemo(() => {
    if (!startId) return 0;
    const idx = items.findIndex((i) => i.id === startId);
    return idx >= 0 ? idx : 0;
  }, [items, startId]);

  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<FeedItem | null>(null);
  const [menuItem, setMenuItem] = useState<FeedItem | null>(null);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const commentsSheetRef = useRef<BottomSheetModal>(null);
  /** ฟีดโปรไฟล์ไม่สลับแท็บ — ต้องมี SharedValue ให้ FeedReelCard */
  const pagerX = useSharedValue(0);

  const activeProduct = useMemo(() => {
    const item = items.find((i) => i.product.id === activeProductId)
      ?? storeItems.find((i) => i.product.id === activeProductId);
    return item?.product ?? null;
  }, [activeProductId, items, storeItems]);

  const activeCommentsItem = useMemo(
    () => items.find((i) => i.id === activeCommentsFeedId) ?? null,
    [activeCommentsFeedId, items],
  );

  useEffect(() => {
    setActiveItemId(items[initialIndex]?.id ?? items[0]?.id ?? null);
  }, [items, initialIndex]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!activeItemId) return;
    const timer = setTimeout(() => {
      const item = itemsRef.current.find((i) => i.id === activeItemId);
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

  useEffect(() => {
    if (viewportHeight <= 0 || items.length === 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    });
  }, [viewportHeight, initialIndex, items.length]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const id = viewableItems[0]?.item?.id as string | undefined;
    if (id) setActiveItemId(id);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const openCommentsSheet = useCallback(
    (feedId: string) => {
      openComments(feedId);
      requestAnimationFrame(() => commentsSheetRef.current?.present());
    },
    [openComments],
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
      const nextLiked = !item.liked;
      toggleLike(item.id);
      void syncFeedLike(item.id, nextLiked);
    },
    [toggleLike],
  );

  useEffect(() => {
    if (!autoAdvance || !activeItemId || viewportHeight <= 0) return;
    const idx = items.findIndex((i) => i.id === activeItemId);
    if (idx < 0 || idx >= items.length - 1) return;
    const ms = Math.max(2800, Math.round(15000 / playbackRate));
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: idx + 1, animated: true });
    }, ms);
    return () => clearTimeout(t);
  }, [autoAdvance, playbackRate, activeItemId, items, viewportHeight]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== viewportHeight) setViewportHeight(h);
  };

  const title = isSelf ? profile.displayName : (items[0]?.author ?? `@${ownerKey}`);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace(isSelf ? '/(tabs)/profile' : `/creator/${encodeURIComponent(ownerKey)}`);
          }}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        {!chromeHidden ? (
          <Text style={styles.topTitle} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <View style={styles.topTitle} />
        )}
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            const item = items.find((i) => i.id === activeItemId) ?? items[0];
            if (!item) return;
            void Haptics.selectionAsync();
            setMenuItem(item);
          }}
          hitSlop={10}
          accessibilityLabel="ตัวเลือกเพิ่มเติม"
        >
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.feedClip} onLayout={onLayout}>
        {viewportHeight > 0 && items.length > 0 ? (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            pagingEnabled
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            snapToInterval={viewportHeight}
            snapToAlignment="start"
            disableIntervalMomentum
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({
              length: viewportHeight,
              offset: viewportHeight * index,
              index,
            })}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 80);
            }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            renderItem={({ item }) => (
              <FeedReelCard
                item={item}
                height={viewportHeight}
                isActive={item.id === activeItemId}
                onComment={() => openCommentsSheet(item.id)}
                onShare={() => setShareItem(item)}
                onLike={() => likeClip(item)}
                liked={item.liked}
                likes={item.likes}
                onLongPressMenu={() => setMenuItem(item)}
                onAvatar={() => {
                  if (isSelf) router.replace('/(tabs)/profile');
                  else router.replace(`/creator/${encodeURIComponent(ownerKey)}`);
                }}
                onProduct={
                  resolveShopMaster(item.product, masters)
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
                enableProfileSwipe={false}
                enableTabSwipeLeft={false}
                screenWidth={screenWidth}
                tabCount={1}
                pagerX={pagerX}
              />
            )}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>ยังไม่มีคลิปของโปรไฟล์นี้</Text>
          </View>
        )}
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
        isOwnPost={Boolean(menuItem && isSelf)}
        canReport={Boolean(menuItem) && !isSelf}
        saved={Boolean(menuItem?.saved)}
        onClose={() => setMenuItem(null)}
        onEditPost={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target || !isSelf) return;
          beginEditPostFromFeedItem(target);
        }}
        onDeletePost={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target || !isSelf) return;
          Alert.alert('ลบโพสต์นี้?', 'โพสต์จะถูกเอาออกถาวร', [
            { text: 'ยกเลิก', style: 'cancel' },
            {
              text: 'ลบ',
              style: 'destructive',
              onPress: async () => {
                const deletion = deletePost(target.id);
                if (router.canGoBack()) router.back();
                if (await deletion) {
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
          if (!target || isSelf) return;
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
        targetLabel={
          reportTarget ? `${reportTarget.author} · ${reportTarget.caption.slice(0, 40)}` : undefined
        }
        blockUserId={reportTarget?.authorHandle.replace(/^@/, '')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.ink,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  feedClip: {
    flex: 1,
    backgroundColor: colors.brand.ink,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
  },
});
