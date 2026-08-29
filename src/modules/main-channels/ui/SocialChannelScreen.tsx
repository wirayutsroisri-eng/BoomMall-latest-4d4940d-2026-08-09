import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { router, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import type { FeedItem } from '@/modules/feed/domain/types';
import { isBoardPost } from '@/modules/feed/domain/selectFeedByTab';
import { syncFeedBlockUser, syncFeedHide, syncFeedInterested, syncFeedLike, syncFeedNotInterested, syncFeedSave, syncFeedShare } from '@/modules/feed/data/feedEngageApi';
import { CommentsBottomSheet } from '@/modules/feed/ui/CommentsBottomSheet';
import { ProductBottomSheet } from '@/modules/feed/ui/ProductBottomSheet';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { resolveShopMaster } from '@/modules/shop/domain/product-display';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { FeedPostCard } from './FeedPostCard';
import { FeedStatusRail } from './FeedStatusRail';
import { useStoryStore } from '@/modules/story/state/story-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { ContentRefreshOverlay } from '@/shared/components/ContentRefreshOverlay';
import { withMinimumDuration } from '@/shared/utils/minimumDuration';
import { FeedLongPressSheet } from '@/modules/feed/ui/FeedLongPressSheet';
import { ReportBlockSheet } from '@/modules/safety/ui/ReportBlockSheet';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { beginEditPostFromFeedItem } from '@/modules/create/data/beginEditPostFromFeed';

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
  const routeFocused = useIsFocused();
  const playbackActive = active && routeFocused;
  const allItems = useFeedStore((state) => state.items);
  const refreshFeed = useFeedStore((state) => state.refreshFromServer);
  const toggleLike = useFeedStore((state) => state.toggleLike);
  const toggleSave = useFeedStore((state) => state.toggleSave);
  const deletePost = useFeedStore((state) => state.deletePost);
  const bumpShare = useFeedStore((state) => state.bumpShare);
  const openComments = useFeedStore((state) => state.openComments);
  const activeCommentsFeedId = useFeedStore((state) => state.activeCommentsFeedId);
  const openProductSheet = useFeedStore((state) => state.openProductSheet);
  const activeProductId = useFeedStore((state) => state.activeProductId);
  const masters = useInventoryStore((state) => state.masters);
  const startConversation = useChatStore((state) => state.startConversationWithCreator);
  const profile = useLoyaltyStore((state) => state.profile);
  const authHydrated = useAuthStore((state) => state.hydrated);
  const sessionToken = useAuthStore((state) => state.sessionToken);
  const authUserId = useAuthStore((state) => state.user?.id);
  const stories = useStoryStore((state) => state.stories);
  const refreshStories = useStoryStore((state) => state.refresh);
  const commentsRef = useRef<BottomSheetModal>(null);
  const productRef = useRef<BottomSheetModal>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<FeedItem | null>(null);
  const [reportTarget, setReportTarget] = useState<FeedItem | null>(null);
  const [undoHiddenItem, setUndoHiddenItem] = useState<FeedItem | null>(null);
  const hiddenContentIds = useModerationStore((state) => state.hiddenContentIds);
  const blockedUserIds = useModerationStore((state) => state.blockedUserIds);
  const hideContent = useModerationStore((state) => state.hideContent);
  const restoreContent = useModerationStore((state) => state.restoreContent);
  const blockUser = useModerationStore((state) => state.blockUser);
  const isFollowing = useFollowStore((state) => state.isFollowing);
  const follow = useFollowStore((state) => state.follow);
  const unfollow = useFollowStore((state) => state.unfollow);

  const channelItems = useMemo(() => filterChannel(allItems, kind)
    .filter((item) => !hiddenContentIds.includes(item.id))
    .filter((item) => !blockedUserIds.includes((item.authorId ?? item.authorHandle).replace(/^@/, '').toLowerCase())),
  [allItems, blockedUserIds, hiddenContentIds, kind]);
  const visibleItems = useMemo(() => channelItems.slice(0, visibleCount), [channelItems, visibleCount]);
  const activeCommentsItem = allItems.find((item) => item.id === activeCommentsFeedId);
  const activeProduct = allItems.find((item) => item.product.id === activeProductId)?.product ?? null;
  const empty = emptyCopy(kind);
  const ownFeedItem = allItems.find((item) => item.isUserPost);

  useEffect(() => {
    if (kind === 'feed' && active && authHydrated && authUserId && sessionToken) {
      void refreshStories().catch(() => undefined);
    }
  }, [active, authHydrated, authUserId, kind, refreshStories, sessionToken]);

  useEffect(() => {
    if (!undoHiddenItem) return;
    const timer = setTimeout(() => setUndoHiddenItem(null), 5000);
    return () => clearTimeout(timer);
  }, [undoHiddenItem]);

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
      await withMinimumDuration(Promise.all([
        refreshFeed(),
        kind === 'feed' && authHydrated && sessionToken
          ? refreshStories()
          : Promise.resolve(),
      ]));
      setVisibleCount(PAGE_SIZE);
    } finally {
      setRefreshing(false);
    }
  }, [authHydrated, kind, refreshFeed, refreshStories, sessionToken]);

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
        active={playbackActive && item.id === activeItemId}
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
        onMenu={() => setMenuItem(item)}
        onAuthor={() => openAuthor(item)}
        onChat={kind === 'jobs' || kind === 'secondhand' ? () => openChat(item) : undefined}
        onProduct={master ? () => {
          openProductSheet(item.product.id);
          requestAnimationFrame(() => productRef.current?.present());
        } : undefined}
      />
    );
  }, [activeItemId, bumpShare, kind, masters, openAuthor, openChat, openComments, openProductSheet, playbackActive, toggleLike, toggleSave]);

  return (
    <View style={styles.root}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => `${kind}:${item.id}`}
        renderItem={renderItem}
        scrollEnabled={playbackActive}
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
            stories={stories}
            onCreateStory={() => router.push('/story-create')}
            onOpenStory={(storyId) => router.push({ pathname: '/story-viewer', params: { storyId } })}
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
      <FeedLongPressSheet
        visible={Boolean(menuItem)}
        item={menuItem}
        isOwnPost={Boolean(menuItem?.isUserPost)}
        canReport={Boolean(menuItem && !menuItem.isUserPost)}
        saved={Boolean(menuItem?.saved)}
        followed={Boolean(menuItem && isFollowing(menuItem.authorHandle))}
        onClose={() => setMenuItem(null)}
        onEditPost={() => { const target = menuItem; setMenuItem(null); if (target?.isUserPost) beginEditPostFromFeedItem(target); }}
        onDeletePost={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target?.isUserPost) return;
          Alert.alert('ลบโพสต์นี้?', 'โพสต์จะถูกลบออกจากระบบอย่างถาวร', [
            { text: 'ยกเลิก', style: 'cancel' },
            { text: 'ลบ', style: 'destructive', onPress: () => void deletePost(target.id).then((ok) => { if (!ok) Alert.alert('ลบไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง'); }) },
          ]);
        }}
        onInterested={() => { const target = menuItem; setMenuItem(null); if (target) void syncFeedInterested(target.id); }}
        onNotInterested={() => { const target = menuItem; setMenuItem(null); if (target) void syncFeedNotInterested(target.id); }}
        onSave={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target) return;
          const nextSaved = !target.saved;
          toggleSave(target.id);
          void syncFeedSave(target.id, nextSaved).then((result) => {
            if (result) return;
            toggleSave(target.id);
            Alert.alert('บันทึกไม่สำเร็จ', 'ระบบคืนสถานะโพสต์แล้ว กรุณาลองใหม่');
          });
        }}
        onToggleFollow={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target || target.isUserPost) return;
          if (isFollowing(target.authorHandle)) unfollow(target.authorHandle);
          else follow(target.authorHandle);
        }}
        onHide={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target) return;
          hideContent(target.id);
          setUndoHiddenItem(target);
          void syncFeedHide(target.id, true).then((result) => {
            if (result) return;
            restoreContent(target.id);
            setUndoHiddenItem(null);
            Alert.alert('ซ่อนโพสต์ไม่สำเร็จ', 'ระบบคืนโพสต์ให้แล้ว กรุณาลองใหม่');
          });
        }}
        onBlock={() => {
          const target = menuItem;
          setMenuItem(null);
          if (!target || target.isUserPost) return;
          Alert.alert('บล็อกผู้ใช้นี้?', 'คุณจะไม่เห็นเนื้อหาหรือรับการติดต่อจากบัญชีนี้', [
            { text: 'ยกเลิก', style: 'cancel' },
            { text: 'บล็อก', style: 'destructive', onPress: () => {
              const userId = (target.authorId ?? target.authorHandle).replace(/^@/, '');
              blockUser(userId);
              void syncFeedBlockUser(userId, true);
            } },
          ]);
        }}
        onWhy={() => { const target = menuItem; setMenuItem(null); if (!target) return; const reason = isFollowing(target.authorHandle) ? 'เพราะคุณติดตามบัญชีนี้' : target.location ? 'กำลังได้รับความสนใจใกล้พื้นที่ของคุณ' : 'คล้ายกับโพสต์ที่คุณเคยดูหรือสนใจ'; Alert.alert('ทำไมฉันจึงเห็นโพสต์นี้', reason); }}
        onReport={() => { const target = menuItem; setMenuItem(null); if (target && !target.isUserPost) setTimeout(() => setReportTarget(target), 260); }}
        onShare={() => { const target = menuItem; setMenuItem(null); if (target) void Share.share({ message: `${target.author}\n${target.caption}` }); }}
      />
      <ReportBlockSheet visible={Boolean(reportTarget)} onClose={() => setReportTarget(null)} kind="content" targetId={reportTarget?.id ?? ''} targetLabel={reportTarget ? `${reportTarget.author} · ${reportTarget.caption.slice(0, 60)}` : undefined} blockUserId={reportTarget ? (reportTarget.authorId ?? reportTarget.authorHandle).replace(/^@/, '') : undefined} />
      {undoHiddenItem ? <View style={styles.undoToast}><Text style={styles.undoText}>ซ่อนโพสต์แล้ว</Text><Pressable onPress={() => { restoreContent(undoHiddenItem.id); void syncFeedHide(undoHiddenItem.id, false); setUndoHiddenItem(null); }}><Text style={styles.undoAction}>เลิกทำ</Text></Pressable></View> : null}
      <ContentRefreshOverlay visible={refreshing} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E9ECE9' },
  content: { paddingBottom: 120 },
  emptyContent: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emptyTitle: { color: '#202824', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#68736D', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  undoToast: { position: 'absolute', left: 16, right: 16, bottom: 88, minHeight: 48, borderRadius: 14, paddingHorizontal: 16, backgroundColor: '#202824', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 110 },
  undoText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  undoAction: { color: '#58A6FF', fontSize: 14, fontWeight: '900' },
});
