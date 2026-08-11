import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
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
import { useCallStore } from '@/modules/chat/state/call-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { FeedReelCard } from '@/modules/feed/ui/FeedReelCard';
import { ProductBottomSheet } from '@/modules/feed/ui/ProductBottomSheet';
import { CommentsBottomSheet } from '@/modules/feed/ui/CommentsBottomSheet';
import { normalizeAuthorHandle } from '@/modules/feed/domain/selectFeedByAuthor';
import { buildOwnerFeedItems } from '@/modules/profile/data/buildOwnerFeedItems';
import type { FeedItem } from '@/modules/feed/domain/types';
import { colors } from '@/shared/theme/colors';
import { ENABLE_CALLS, ENABLE_FEED_COIN_REACTION } from '@/shared/compliance/appStoreGates';

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
  const tipClip = useFeedStore((s) => s.tipClip);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const openComments = useFeedStore((s) => s.openComments);
  const openProductSheet = useFeedStore((s) => s.openProductSheet);
  const activeProductId = useFeedStore((s) => s.activeProductId);
  const activeCommentsFeedId = useFeedStore((s) => s.activeCommentsFeedId);
  const startCall = useCallStore((s) => s.startCall);
  const setActive = useCallStore((s) => s.setActive);
  const profile = useLoyaltyStore((s) => s.profile);

  const myHandle = normalizeAuthorHandle(profile.handle);
  const ownerKey = normalizeAuthorHandle(handle);
  const isSelf = ownerKey === myHandle;

  const items = useMemo(() => {
    const built = buildOwnerFeedItems(ownerKey, storeItems, {
      isSelf,
      displayName: isSelf ? profile.displayName : undefined,
    });
    if (!isSelf || !profile.displayName.trim()) return built;
    /** ให้ชื่อบนคลิปตรงกับชื่อโปรไฟล์เสมอ */
    return built.map((item) => ({
      ...item,
      author: profile.displayName,
      authorHandle: profile.handle.startsWith('@') ? profile.handle : `@${ownerKey}`,
    }));
  }, [ownerKey, storeItems, isSelf, profile.displayName, profile.handle]);

  const initialIndex = useMemo(() => {
    if (!startId) return 0;
    const idx = items.findIndex((i) => i.id === startId);
    return idx >= 0 ? idx : 0;
  }, [items, startId]);

  const [viewportHeight, setViewportHeight] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
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

  /** Empty feed coin — reaction only, no wallet value */
  const tipOneCoin = useCallback(
    (item: FeedItem) => {
      if (!ENABLE_FEED_COIN_REACTION) return;
      tipClip(item.id, 1);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [tipClip],
  );

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
        <Text style={styles.topTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.backBtn} />
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
                onTip={ENABLE_FEED_COIN_REACTION ? () => tipOneCoin(item) : undefined}
                onComment={() => openCommentsSheet(item.id)}
                onVaultSave={() => toggleSave(item.id)}
                onShare={() => Alert.alert('แชร์', `แชร์คลิปของ ${item.author}`)}
                onAvatar={() => {
                  if (isSelf) router.replace('/(tabs)/profile');
                  else router.replace(`/creator/${encodeURIComponent(ownerKey)}`);
                }}
                onProduct={() => openProduct(item.product.id)}
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
