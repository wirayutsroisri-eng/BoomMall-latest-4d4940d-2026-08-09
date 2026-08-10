import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/shared/theme/colors';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import type { FeedComment } from '@/modules/feed/domain/types';
import { Avatar } from '@/shared/components/Avatar';

type Props = {
  feedId: string | null;
  commentCount: number;
};

export const CommentsBottomSheet = forwardRef<BottomSheetModal, Props>(
  function CommentsBottomSheet({ feedId, commentCount }, ref) {
    const insets = useSafeAreaInsets();
    const commentsByFeedId = useFeedStore((s) => s.commentsByFeedId);
    const addComment = useFeedStore((s) => s.addComment);
    const toggleCommentLike = useFeedStore((s) => s.toggleCommentLike);
    const profile = useLoyaltyStore((s) => s.profile);
    const [draft, setDraft] = useState('');

    const snapPoints = useMemo(() => ['62%', '90%'], []);
    const comments = feedId ? commentsByFeedId[feedId] ?? [] : [];
    const myInitial = profile.displayName.slice(0, 1) || 'B';

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
      ),
      [],
    );

    const onSend = useCallback(() => {
      const text = draft.trim();
      if (!text || !feedId) return;
      addComment(feedId, text, profile.displayName, myInitial);
      setDraft('');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [addComment, draft, feedId, myInitial, profile.displayName]);

    const renderItem = useCallback(
      ({ item }: { item: FeedComment }) => (
        <View style={styles.row}>
          <Avatar
            initial={item.authorInitial}
            size={36}
            radius={12}
            backgroundColor={colors.brand.mist}
            textStyle={{ color: colors.brand.primaryDark }}
          />
          <View style={styles.body}>
            <Text style={styles.author}>{item.author}</Text>
            <Text style={styles.text}>{item.text}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.time}>{item.createdAt}</Text>
              <Text style={styles.reply}>ตอบกลับ</Text>
            </View>
          </View>
          <Pressable
            hitSlop={10}
            style={styles.likeCol}
            onPress={() => feedId && toggleCommentLike(feedId, item.id)}
          >
            <Ionicons
              name={item.liked ? 'heart' : 'heart-outline'}
              size={18}
              color={item.liked ? colors.accent.live : colors.text.muted}
            />
            <Text style={styles.likeCount}>{item.likes}</Text>
          </Pressable>
        </View>
      ),
      [feedId, toggleCommentLike],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <Text style={styles.title}>{commentCount.toLocaleString('th-TH')} ความคิดเห็น</Text>
        <BottomSheetFlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>ยังไม่มีความคิดเห็น เป็นคนแรกเลย!</Text>
          }
        />
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Avatar uri={profile.avatarUri} initial={myInitial} size={30} radius={11} />
          <TextInput
            style={styles.input}
            placeholder="เพิ่มความคิดเห็น..."
            placeholderTextColor={colors.text.muted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={onSend}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
            onPress={onSend}
            disabled={!draft.trim()}
          >
            <Ionicons name="arrow-up" size={18} color={colors.brand.ink} />
          </Pressable>
        </View>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface.sheet,
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  title: {
    textAlign: 'center',
    color: colors.text.inverse,
    fontWeight: '800',
    fontSize: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  empty: {
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 30,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  body: { flex: 1 },
  author: {
    color: colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  text: {
    color: colors.text.inverse,
    fontSize: 14,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
  time: {
    color: colors.text.muted,
    fontSize: 11,
  },
  reply: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  likeCol: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 4,
  },
  likeCount: {
    color: colors.text.muted,
    fontSize: 10,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    color: colors.text.inverse,
    fontSize: 14,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
