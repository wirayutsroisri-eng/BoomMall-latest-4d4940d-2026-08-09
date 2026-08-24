import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, Share, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import type { FeedItem } from '@/modules/feed/domain/types';
import { isBoardPost } from '@/modules/feed/domain/selectFeedByTab';
import { syncFeedLike, syncFeedShare } from '@/modules/feed/data/feedEngageApi';
import { CommentsBottomSheet } from '@/modules/feed/ui/CommentsBottomSheet';
import { ProductBottomSheet } from '@/modules/feed/ui/ProductBottomSheet';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { resolveShopMaster } from '@/modules/shop/domain/product-display';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { FeedPostCard } from './FeedPostCard';
import { FeedStatusRail } from './FeedStatusRail';

export type SocialChannelKind = 'feed' | 'nearby' | 'jobs' | 'secondhand';

type Props = {
  kind: SocialChannelKind;
  active: boolean;
  onVerticalScroll?: (offsetY: number) => void;
};

const PAGE_SIZE = 10;

function secondhandItem(item: FeedItem) {
  const tags = item.product.tags.map((tag) => tag.toLowerCase());
  return (item.product.tier === 'C2C' && item.product.basePrice > 0)
    || tags.some((tag) => tag.includes('มือสอง') || tag.includes('secondhand'));
}

function filterChannel(items: FeedItem[], kind: SocialChannelKind) {
  if (kind === 'jobs') return items.filter(isBoardPost);
  if (kind === 'secondhand') return items.filter(secondhandItem).filter((item) => !isBoardPost(item));
  if (kind === 'nearby') return items.filter((item) => item.lane === 'nearby' || Boolean(item.gps));
  return items.filter((item) => !isBoardPost(item));
}

function emptyCopy(kind: SocialChannelKind) {
  if (kind === 'jobs') return ['ยังไม่มีประกาศงาน', 'ประกาศจากระบบ Feed/Board จะปรากฏที่นี่'];
  if (kind === 'secondhand') return ['ยังไม่มีประกาศมือสอง', 'โพสต์ C2C และโพสต์ที่ติดแท็กมือสองจะปรากฏที่นี่'];
  if (kind === 'nearby') return ['ยังไม่มีคอนเทนต์ใกล้คุณ', 'ระบบยังไม่ขอ Location จนกว่าคุณจะเลือกใช้ตำแหน่ง'];
  return ['ยังไม่มีโพสต์ในฟีด', 'โพสต์ล่าสุดจาก SocialPost API จะปรากฏที่นี่'];
}

export function SocialChannelScreen({ kind, active, onVerticalScroll }: Props) {
  const insets = useSafeAreaInsets();
  const allItems = useFeedStore((state) => state.items);
  const hydrate = useFeedStore((state) => state.hydrateFromServer);
  const toggleLike = useFeedStore((state) => state.toggleLike);
  const toggleSave = useFeedStore((state) => state.toggleSave);
  const bumpShare = useFeedStore((state) => state.bumpShare);
  const openComments = useFeedStore((state) => state.openComments);
  const activeCommentsFeedId = useFeedStore((state) => state.activeCommentsFeedId);
  const openProductSheet = useFeedStore((state) => state.openProductSheet);
  const activeProductId = useFeedStore((state) => state.activeProductId);
  const masters = useInventoryStore((state) => state.masters);
  const startConversation = useChatStore((state) => state.startConversationWithCreator);
  const profile = useLoyaltyStore((state) => state.profile);
  const commentsRef = useRef<BottomSheetModal>(null);
  const productRef = useRef<BottomSheetModal>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const channelItems = useMemo(() => filterChannel(allItems, kind), [allItems, kind]);
  const visibleItems = useMemo(() => channelItems.slice(0, visibleCount), [channelItems, visibleCount]);
  const activeCommentsItem = allItems.find((item) => item.id === activeCommentsFeedId);
  const activeProduct = allItems.find((item) => item.product.id === activeProductId)?.product ?? null;
  const empty = emptyCopy(kind);
  const ownFeedItem = allItems.find((item) => item.isUserPost);

  const openAuthor = useCallback((item: FeedItem) => {
    if (item.isUserPost) router.push('/(tabs)/profile');
    else router.push(`/creator/${encodeURIComponent(item.authorHandle.replace(/^@/, ''))}`);
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const next = viewableItems.find((token) => token.isViewable)?.item as FeedItem | undefined;
    setActiveItemId(next?.id ?? null);
  }).current;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await hydrate();
      setVisibleCount(PAGE_SIZE);
    } finally {
      setRefreshing(false);
    }
  }, [hydrate]);

  const openChat = useCallback((item: FeedItem) => {
    const conversationId = startConversation(
      item.author,
      item.authorHandle,
      item.gradient[1],
      {
        id: `ref-${item.id}`,
        feedId: item.id,
        title: item.product.name || item.caption.slice(0, 60),
        subtitle: item.caption.slice(0, 100),
        price: item.product.basePrice,
        currency: item.product.currency,
        tier: item.product.tier,
        imageUri: item.imageUris?.[0] ?? item.imageUri,
        gradient: item.gradient,
        authorHandle: item.authorHandle,
      },
    );
    router.push(`/(tabs)/chat/${encodeURIComponent(conversationId)}`);
  }, [startConversation]);

  const renderItem = useCallback(({ item }: { item: FeedItem }) => {
    const master = resolveShopMaster(item.product, masters);
    return (
      <FeedPostCard
        item={item}
        active={active && item.id === activeItemId}
        channel={kind}
        onLike={() => {
          const liked = !item.liked;
          toggleLike(item.id);
          void syncFeedLike(item.id, liked);
        }}
        onComment={() => {
          openComments(item.id);
          requestAnimationFrame(() => commentsRef.current?.present());
        }}
        onShare={() => {
          bumpShare(item.id);
          void syncFeedShare(item.id);
          void Share.share({ message: `${item.author}\n${item.caption}` });
        }}
        onSave={() => toggleSave(item.id)}
        onAuthor={() => openAuthor(item)}
        onChat={kind === 'jobs' || kind === 'secondhand' ? () => openChat(item) : undefined}
        onProduct={master ? () => {
          openProductSheet(item.product.id);
          requestAnimationFrame(() => productRef.current?.present());
        } : undefined}
      />
    );
  }, [active, activeItemId, bumpShare, kind, masters, openAuthor, openChat, openComments, openProductSheet, toggleLike, toggleSave]);

  return (
    <View style={styles.root}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => `${kind}:${item.id}`}
        renderItem={renderItem}
        scrollEnabled={active}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          visibleItems.length ? styles.content : styles.emptyContent,
          { paddingTop: kind === 'feed' ? insets.top + 60 : 0 },
        ]}
        onScroll={(event) => onVerticalScroll?.(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        onEndReachedThreshold={0.65}
        onEndReached={() => setVisibleCount((count) => Math.min(channelItems.length, count + PAGE_SIZE))}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 55 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#38DDA4" />}
        ListHeaderComponent={kind === 'feed' ? (
          <FeedStatusRail
            items={channelItems}
            ownAvatarUri={profile.avatarUri || ownFeedItem?.authorAvatarUri}
            ownInitial={(profile.displayName || ownFeedItem?.author || 'ผู้ใช้').slice(0, 1)}
            onCreate={() => router.push('/create-modal')}
            onAuthor={openAuthor}
          />
        ) : null}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{empty[0]}</Text>
            <Text style={styles.emptyText}>{empty[1]}</Text>
          </View>
        )}
      />
      <CommentsBottomSheet ref={commentsRef} feedId={activeCommentsFeedId} commentCount={activeCommentsItem?.comments ?? 0} />
      <ProductBottomSheet ref={productRef} product={activeProduct} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070A08' },
  content: { paddingBottom: 120 },
  emptyContent: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#89958F', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
});
