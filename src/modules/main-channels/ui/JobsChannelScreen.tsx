import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { isBoardPost } from '@/modules/feed/domain/selectFeedByTab';
import { CommunityBoardList } from '@/modules/feed/ui/CommunityBoardList';
import { CommentsBottomSheet } from '@/modules/feed/ui/CommentsBottomSheet';
import { ContentRefreshOverlay } from '@/shared/components/ContentRefreshOverlay';
import { withMinimumDuration } from '@/shared/utils/minimumDuration';

type Props = {
  active: boolean;
  onVerticalScroll?: (offsetY: number) => void;
};

/** Main-channel adapter for the existing Community Board / job marketplace. */
export function JobsChannelScreen({ active, onVerticalScroll }: Props) {
  const insets = useSafeAreaInsets();
  const items = useFeedStore((state) => state.items);
  const openComments = useFeedStore((state) => state.openComments);
  const activeCommentsFeedId = useFeedStore((state) => state.activeCommentsFeedId);
  const refreshFeed = useFeedStore((state) => state.refreshFromServer);
  const [refreshing, setRefreshing] = useState(false);
  const commentsRef = useRef<BottomSheetModal>(null);
  const boardItems = useMemo(() => items.filter(isBoardPost), [items]);
  const activeCommentsItem = items.find((item) => item.id === activeCommentsFeedId);

  const openPost = useCallback((feedId: string) => {
    openComments(feedId);
    requestAnimationFrame(() => commentsRef.current?.present());
  }, [openComments]);

  return (
    <View style={styles.root} pointerEvents={active ? 'auto' : 'none'}>
      <CommunityBoardList
        items={boardItems}
        topInset={insets.top}
        onOpenPost={openPost}
        onVerticalScroll={onVerticalScroll}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void withMinimumDuration(refreshFeed()).finally(() => setRefreshing(false));
        }}
      />
      <CommentsBottomSheet
        ref={commentsRef}
        feedId={activeCommentsFeedId}
        commentCount={activeCommentsItem?.comments ?? 0}
      />
      <ContentRefreshOverlay visible={refreshing} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
