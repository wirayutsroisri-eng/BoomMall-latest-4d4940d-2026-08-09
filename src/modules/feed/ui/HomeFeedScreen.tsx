import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useCallStore } from '@/modules/chat/state/call-store';
import type { FeedItem, FeedTab } from '@/modules/feed/domain/types';
import { FeedHeader } from './FeedHeader';
import { FeedReelCard } from './FeedReelCard';
import { ProductBottomSheet } from './ProductBottomSheet';
import { CommentsBottomSheet } from './CommentsBottomSheet';
import { CreatorProfileSheet } from '@/modules/profile/ui/CreatorProfileScreen';
import { colors } from '@/shared/theme/colors';

/** Left → Right header order. No wrap / no infinite loop. */
const TAB_ORDER: FeedTab[] = ['nearby', 'following', 'foryou'];

export function HomeFeedScreen() {
  const tab = useFeedStore((s) => s.tab);
  const items = useFeedStore((s) => s.items);
  const setTab = useFeedStore((s) => s.setTab);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const openProductSheet = useFeedStore((s) => s.openProductSheet);
  const activeProductId = useFeedStore((s) => s.activeProductId);
  const openComments = useFeedStore((s) => s.openComments);
  const activeCommentsFeedId = useFeedStore((s) => s.activeCommentsFeedId);
  const activeCreatorHandle = useFeedStore((s) => s.activeCreatorHandle);
  const activeCreatorFeedId = useFeedStore((s) => s.activeCreatorFeedId);
  const creatorProfileNonce = useFeedStore((s) => s.creatorProfileNonce);
  const openCreatorProfileState = useFeedStore((s) => s.openCreatorProfile);
  const closeCreatorProfile = useFeedStore((s) => s.closeCreatorProfile);
  const startCall = useCallStore((s) => s.startCall);
  const setActive = useCallStore((s) => s.setActive);

  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const commentsSheetRef = useRef<BottomSheetModal>(null);
  const creatorSheetRef = useRef<BottomSheetModal>(null);
  const handledCreatorNonceRef = useRef(0);
  const activeIndexRef = useRef(0);

  const activeProduct = useMemo(() => {
    const item = items.find((i) => i.product.id === activeProductId);
    return item?.product ?? null;
  }, [activeProductId, items]);

  const activeCommentsItem = useMemo(
    () => items.find((i) => i.id === activeCommentsFeedId) ?? null,
    [activeCommentsFeedId, items],
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      activeIndexRef.current = viewableItems[0].index;
      const id = viewableItems[0].item?.id as string | undefined;
      if (id) setActiveItemId(id);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const openSheet = useCallback(
    (productId: string) => {
      openProductSheet(productId);
      requestAnimationFrame(() => sheetRef.current?.present());
    },
    [openProductSheet],
  );

  const openCommentsSheet = useCallback(
    (feedId: string) => {
      openComments(feedId);
      requestAnimationFrame(() => commentsSheetRef.current?.present());
    },
    [openComments],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportHeight(e.nativeEvent.layout.height);
  }, []);

  /** Open the Visitor Profile bottom sheet for the clip's creator — never an Alert dialog. */
  const openCreatorProfile = useCallback(
    (item: FeedItem) => {
      const handle = item.authorHandle.replace(/^@/, '');
      // Pass feedId so Visitor Profile → Chat can auto-attach a Content Reference Card
      openCreatorProfileState(handle, item.id);
    },
    [openCreatorProfileState],
  );

  // Re-present the sheet on every open request (nonce), including re-opening the *same*
  // creator when returning from a chat's [< Back] button.
  useEffect(() => {
    if (creatorProfileNonce > 0 && creatorProfileNonce !== handledCreatorNonceRef.current) {
      handledCreatorNonceRef.current = creatorProfileNonce;
      requestAnimationFrame(() => creatorSheetRef.current?.present());
    }
  }, [creatorProfileNonce]);

  /**
   * Swipe left:
   * - nearby → following → foryou (step forward, no wrap)
   * - foryou (last tab) → open Visitor Profile of the active creator
   */
  const onSwipeLeft = useCallback(
    (item: FeedItem) => {
      const currentIndex = TAB_ORDER.indexOf(tab);
      if (currentIndex < 0) return;
      if (tab === 'foryou' || currentIndex >= TAB_ORDER.length - 1) {
        openCreatorProfile(item);
        return;
      }
      setTab(TAB_ORDER[currentIndex + 1]);
    },
    [openCreatorProfile, setTab, tab],
  );

  /**
   * Swipe right:
   * - foryou → following → nearby (step backward)
   * - nearby (leftmost) → hard boundary, do nothing
   */
  const onSwipeRight = useCallback(() => {
    const currentIndex = TAB_ORDER.indexOf(tab);
    if (currentIndex <= 0) return;
    setTab(TAB_ORDER[currentIndex - 1]);
  }, [setTab, tab]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedReelCard
        item={item}
        height={viewportHeight}
        isActive={item.id === activeItemId}
        onLike={() => toggleLike(item.id)}
        onComment={() => openCommentsSheet(item.id)}
        onQuickBuy={() => openSheet(item.product.id)}
        onVaultSave={() => toggleSave(item.id)}
        onShare={() => Alert.alert('แชร์', `แชร์คลิปของ ${item.author}`)}
        onAvatar={() => openCreatorProfile(item)}
        onCall={() => {
          startCall(item.author, 'voice');
          setTimeout(() => setActive(), 900);
        }}
        onSwipeLeft={() => onSwipeLeft(item)}
        onSwipeRight={onSwipeRight}
      />
    ),
    [
      activeItemId,
      onSwipeLeft,
      onSwipeRight,
      openCommentsSheet,
      openCreatorProfile,
      openSheet,
      setActive,
      startCall,
      toggleLike,
      toggleSave,
      viewportHeight,
    ],
  );

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar style="light" />
      {viewportHeight > 0 ? (
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        snapToInterval={viewportHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: viewportHeight,
          offset: viewportHeight * index,
          index,
        })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
      ) : null}

      <FeedHeader
        tab={tab}
        onChangeTab={setTab}
        onPressLive={() => Alert.alert('LIVE', 'เปิดห้องไลฟ์ Boom EV Shop')}
        onPressSearch={() => router.push('/search')}
      />

      <ProductBottomSheet
        ref={sheetRef}
        product={activeProduct}
        onCheckout={(variant, qty, total) => {
          sheetRef.current?.dismiss();
          Alert.alert(
            'สั่งซื้อสำเร็จ',
            `${variant.label} × ${qty}\nยอด ฿${total.toLocaleString('th-TH')}`,
          );
        }}
      />

      <CommentsBottomSheet
        ref={commentsSheetRef}
        feedId={activeCommentsFeedId}
        commentCount={activeCommentsItem?.comments ?? 0}
      />

      <CreatorProfileSheet
        ref={creatorSheetRef}
        handle={activeCreatorHandle}
        feedId={activeCreatorFeedId}
        onDismiss={closeCreatorProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.ink,
  },
});
