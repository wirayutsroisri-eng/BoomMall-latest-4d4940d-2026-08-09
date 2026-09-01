import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View, Alert, type ViewProps } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/shared/theme/colors';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import type { FeedComment } from '@/modules/feed/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { CommentActionSheet } from '@/modules/feed/ui/CommentActionSheet';
import { ReportBlockSheet } from '@/modules/safety/ui/ReportBlockSheet';

type Props = {
  feedId: string | null;
  commentCount: number;
};

type ComposerHandle = {
  focus: () => void;
  blur: () => void;
  clear: () => void;
};

type ComposerProps = {
  avatarUri?: string;
  myInitial: string;
  replyTo: FeedComment | null;
  editTarget: FeedComment | null;
  onClearReply: () => void;
  onCancelEdit: () => void;
  onSend: (text: string) => void;
};

const INPUT_MIN_HEIGHT = 44;
const INPUT_MAX_HEIGHT = 160;

const SHEET_WHITE = '#FFFFFF';
const INK = '#161823';
const MUTED = '#8A8B91';
const INPUT_BG = '#F1F1F2';

/** Keeps draft local so the footer is not rebuilt on every keystroke (was dismissing keyboard). */
const CommentComposer = memo(
  forwardRef<ComposerHandle, ComposerProps>(function CommentComposer(
    { avatarUri, myInitial, replyTo, editTarget, onClearReply, onCancelEdit, onSend },
    ref,
  ) {
    const inputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
    const [draft, setDraft] = useState('');

    useEffect(() => {
      if (!editTarget) return;
      setDraft(editTarget.text);
      requestAnimationFrame(() => inputRef.current?.focus());
    }, [editTarget?.id]);

    useImperativeHandle(ref, () => ({
      focus: () => {
        requestAnimationFrame(() => inputRef.current?.focus());
      },
      blur: () => inputRef.current?.blur(),
      clear: () => setDraft(''),
    }));

    const canSend = draft.trim().length > 0;
    const isEditing = Boolean(editTarget);

    const submit = () => {
      const text = draft.trim();
      if (!text) return;
      onSend(text);
      setDraft('');
    };

    return (
      <View style={styles.footer}>
        {editTarget ? (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerText} numberOfLines={1}>
              แก้ไขความคิดเห็น
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => {
                onCancelEdit();
                setDraft('');
              }}
            >
              <Ionicons name="close" size={18} color={MUTED} />
            </Pressable>
          </View>
        ) : replyTo ? (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerText} numberOfLines={1}>
              ตอบกลับ {replyTo.author}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => {
                onClearReply();
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              <Ionicons name="close" size={18} color={MUTED} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.inputBar}>
          <Avatar uri={avatarUri} initial={myInitial} size={32} radius={16} />
          <BottomSheetTextInput
            ref={inputRef}
            style={styles.input}
            placeholder={
              isEditing
                ? 'แก้ไขความคิดเห็น...'
                : replyTo
                  ? `ตอบกลับ ${replyTo.author}`
                  : 'เพิ่มความคิดเห็น...'
            }
            placeholderTextColor={MUTED}
            value={draft}
            onChangeText={setDraft}
            multiline
            textAlignVertical="top"
            scrollEnabled
            returnKeyType="default"
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={submit}
            disabled={!canSend}
            accessibilityLabel={isEditing ? 'บันทึกความคิดเห็น' : 'ส่งความคิดเห็น'}
          >
            <Ionicons name="arrow-up" size={18} color={canSend ? SHEET_WHITE : MUTED} />
          </Pressable>
        </View>
      </View>
    );
  }),
);

const KEYBOARD_HIDE_FALLBACK_MS = 380;

export const CommentsBottomSheet = forwardRef<BottomSheetModal, Props>(
  function CommentsBottomSheet({ feedId, commentCount }, ref) {
    const insets = useSafeAreaInsets();
    const commentsByFeedId = useFeedStore((s) => s.commentsByFeedId);
    const addComment = useFeedStore((s) => s.addComment);
    const updateComment = useFeedStore((s) => s.updateComment);
    const deleteComment = useFeedStore((s) => s.deleteComment);
    const loadComments = useFeedStore((s) => s.loadComments);
    const closeComments = useFeedStore((s) => s.closeComments);
    const toggleCommentLike = useFeedStore((s) => s.toggleCommentLike);
    const profile = useLoyaltyStore((s) => s.profile);
    const authUser = useAuthStore((s) => s.user);
    const authenticated = useAuthStore((s) => Boolean(s.sessionToken && s.user));
    const blockedUserIds = useModerationStore((s) => s.blockedUserIds);
    const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
    const [editTarget, setEditTarget] = useState<FeedComment | null>(null);
    const [actionComment, setActionComment] = useState<FeedComment | null>(null);
    const [reportComment, setReportComment] = useState<FeedComment | null>(null);
    const [commentsLoaded, setCommentsLoaded] = useState(false);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentsLoadFailed, setCommentsLoadFailed] = useState(false);
    const sheetRef = useRef<BottomSheetModal>(null);
    const composerRef = useRef<ComposerHandle>(null);
    const keyboardVisibleRef = useRef(false);
    const pendingCloseRef = useRef(false);
    const closeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => sheetRef.current as BottomSheetModal);

    const snapPoints = useMemo(() => ['75%'], []);
    const comments = useMemo(() => {
      const list = feedId ? commentsByFeedId[feedId] ?? [] : [];
      const blocked = new Set(blockedUserIds.map((id) => id.toLowerCase()));
      return list.filter((c) => {
        const keys = [c.authorId, c.author.replace(/^@/, '')]
          .filter(Boolean)
          .map((v) => v!.toLowerCase());
        return !keys.some((key) => blocked.has(key));
      });
    }, [commentsByFeedId, feedId, blockedUserIds]);
    const displayCommentCount = commentsLoaded
      ? Math.max(comments.length, commentsLoadFailed ? commentCount : 0)
      : commentCount;
    const myInitial = profile.displayName.slice(0, 1) || 'B';

    const isOwnComment = useCallback(
      (comment: FeedComment) => {
        if (comment.authorId && authUser?.id) return comment.authorId === authUser.id;
        return comment.author.trim().toLowerCase() === profile.displayName.trim().toLowerCase();
      },
      [authUser?.id, profile.displayName],
    );

    const clearCloseFallback = useCallback(() => {
      if (closeFallbackTimerRef.current) {
        clearTimeout(closeFallbackTimerRef.current);
        closeFallbackTimerRef.current = null;
      }
    }, []);

    const closeSheet = useCallback(() => {
      clearCloseFallback();
      pendingCloseRef.current = false;
      sheetRef.current?.close();
    }, [clearCloseFallback]);

    const dismissKeyboard = useCallback(() => {
      Keyboard.dismiss();
    }, []);

    const openCommentActions = useCallback((comment: FeedComment) => {
      dismissKeyboard();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActionComment(comment);
    }, [dismissKeyboard]);

    const requestCloseSheet = useCallback(() => {
      composerRef.current?.blur();
      Keyboard.dismiss();

      if (!keyboardVisibleRef.current) {
        closeSheet();
        return;
      }

      pendingCloseRef.current = true;
      clearCloseFallback();
      closeFallbackTimerRef.current = setTimeout(() => {
        if (!pendingCloseRef.current) return;
        closeSheet();
      }, KEYBOARD_HIDE_FALLBACK_MS);
    }, [clearCloseFallback, closeSheet]);

    const focusComposer = useCallback(() => {
      composerRef.current?.focus();
    }, []);

    const resetSheet = useCallback(() => {
      clearCloseFallback();
      pendingCloseRef.current = false;
      keyboardVisibleRef.current = false;
      composerRef.current?.blur();
      composerRef.current?.clear();
      setReplyTo(null);
      setEditTarget(null);
      setActionComment(null);
      setReportComment(null);
      closeComments();
    }, [clearCloseFallback, closeComments]);

    useEffect(() => {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const showSub = Keyboard.addListener(showEvent, () => {
        keyboardVisibleRef.current = true;
      });
      const hideSub = Keyboard.addListener('keyboardDidHide', () => {
        keyboardVisibleRef.current = false;
        if (!pendingCloseRef.current) return;
        closeSheet();
      });

      return () => {
        showSub.remove();
        hideSub.remove();
        clearCloseFallback();
      };
    }, [clearCloseFallback, closeSheet]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.35}
          pressBehavior="none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={requestCloseSheet} />
        </BottomSheetBackdrop>
      ),
      [requestCloseSheet],
    );

    const onSendText = useCallback(
      (text: string) => {
        if (!text || !feedId) return;
        if (!authenticated) return;
        if (editTarget) {
          updateComment(feedId, editTarget.id, text);
          setEditTarget(null);
          composerRef.current?.clear();
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
        addComment(feedId, text, profile.displayName, myInitial, replyTo?.id);
        setReplyTo(null);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      [
        addComment,
        editTarget,
        feedId,
        authenticated,
        myInitial,
        profile.displayName,
        replyTo,
        updateComment,
      ],
    );

    const confirmDeleteComment = useCallback(
      (comment: FeedComment) => {
        if (!feedId) return;
        Alert.alert('ลบความคิดเห็นนี้?', 'ความคิดเห็นจะถูกเอาออกถาวร', [
          { text: 'ยกเลิก', style: 'cancel' },
          {
            text: 'ลบ',
            style: 'destructive',
            onPress: () => {
              deleteComment(feedId, comment.id);
              if (editTarget?.id === comment.id) {
                setEditTarget(null);
                composerRef.current?.clear();
              }
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ]);
      },
      [deleteComment, editTarget?.id, feedId],
    );

    const renderItem = useCallback(
      ({ item }: { item: FeedComment }) => (
        <View style={[styles.row, item.parentId ? styles.replyRow : null]}>
          <Pressable
            style={styles.commentTap}
            onPress={dismissKeyboard}
            onLongPress={() => openCommentActions(item)}
            delayLongPress={380}
          >
            <Avatar
              initial={item.authorInitial}
              size={36}
              radius={18}
              backgroundColor={INPUT_BG}
              textStyle={{ color: MUTED }}
            />
            <View style={styles.body}>
              <Text style={styles.author}>{item.author}</Text>
              <Text style={styles.text}>{item.text}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.time}>
                  {item.createdAt}
                  {item.editedAt ? ` · ${item.editedAt}` : ''}
                </Text>
                <Pressable
                  onPress={() => {
                    setEditTarget(null);
                    setReplyTo(item);
                    focusComposer();
                  }}
                >
                  <Text style={styles.reply}>ตอบกลับ</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
          <Pressable
            hitSlop={10}
            style={styles.likeCol}
            onPress={() => {
              dismissKeyboard();
              if (feedId) toggleCommentLike(feedId, item.id);
            }}
          >
            <Ionicons
              name={item.liked ? 'heart' : 'heart-outline'}
              size={18}
              color={item.liked ? colors.brand.pink : MUTED}
            />
            <Text style={styles.likeCount}>{item.likes}</Text>
          </Pressable>
        </View>
      ),
      [dismissKeyboard, feedId, focusComposer, openCommentActions, toggleCommentLike],
    );

    const renderFooter = useCallback(
      (props: BottomSheetFooterProps) => (
        <BottomSheetFooter {...props} bottomInset={insets.bottom}>
          <CommentComposer
            ref={composerRef}
            avatarUri={profile.avatarUri ?? undefined}
            myInitial={myInitial}
            replyTo={replyTo}
            editTarget={editTarget}
            onClearReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditTarget(null)}
            onSend={onSendText}
          />
        </BottomSheetFooter>
      ),
      [editTarget, insets.bottom, myInitial, onSendText, profile.avatarUri, replyTo],
    );

    useEffect(() => {
      composerRef.current?.clear();
      setReplyTo(null);
      setEditTarget(null);
      setCommentsLoaded(false);
      setCommentsLoadFailed(false);
      if (!feedId) return;
      setCommentsLoading(true);
      void loadComments(feedId)
        .then((ok) => {
          setCommentsLoadFailed(ok === false);
        })
        .finally(() => {
          setCommentsLoading(false);
          setCommentsLoaded(true);
        });
    }, [feedId, loadComments]);

    // video-feed ใช้ presentation: transparentModal — BottomSheetModal พอร์ทัลไปที่
    // root provider จึงอยู่หลัง native modal. FullWindowOverlay ดึงชีตขึ้นเหนือ modal (iOS)
    const sheetContainer = useCallback(
      ({ children }: ViewProps) =>
        Platform.OS === 'ios' ? (
          <FullWindowOverlay>{children}</FullWindowOverlay>
        ) : (
          <>{children}</>
        ),
      [],
    );

    return (
      <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        index={0}
        enableDynamicSizing={false}
        enableOverDrag={false}
        enablePanDownToClose
        enableHandlePanningGesture
        enableContentPanningGesture
        enableBlurKeyboardOnGesture
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        footerComponent={renderFooter}
        keyboardBehavior="extend"
        keyboardBlurBehavior="none"
        android_keyboardInputMode="adjustResize"
        containerComponent={sheetContainer}
        containerStyle={{ zIndex: 1000, elevation: 1000 }}
        onDismiss={resetSheet}
      >
        <View style={styles.header}>
          <Pressable onPress={dismissKeyboard} accessibilityRole="button">
            <Text style={styles.title}>{displayCommentCount.toLocaleString('th-TH')} ความคิดเห็น</Text>
          </Pressable>
        </View>
        <BottomSheetFlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            commentsLoading ? (
              <Text style={styles.empty}>กำลังโหลดความคิดเห็น...</Text>
            ) : commentsLoadFailed ? (
              <Pressable
                onPress={() => {
                  if (!feedId) return;
                  setCommentsLoading(true);
                  setCommentsLoadFailed(false);
                  void loadComments(feedId)
                    .then((ok) => setCommentsLoadFailed(ok === false))
                    .finally(() => setCommentsLoading(false));
                }}
              >
                <Text style={styles.empty}>โหลดความคิดเห็นไม่ได้ — แตะเพื่อลองใหม่</Text>
              </Pressable>
            ) : (
              <Pressable onPress={dismissKeyboard}>
                <Text style={styles.empty}>ยังไม่มีความคิดเห็น เป็นคนแรกเลย!</Text>
              </Pressable>
            )
          }
        />
      </BottomSheetModal>

      <CommentActionSheet
        visible={Boolean(actionComment)}
        comment={actionComment}
        isOwn={actionComment ? isOwnComment(actionComment) : false}
        onClose={() => setActionComment(null)}
        onEdit={() => {
          if (!actionComment) return;
          setEditTarget(actionComment);
          setReplyTo(null);
          setActionComment(null);
          focusComposer();
        }}
        onDelete={() => {
          if (!actionComment) return;
          const target = actionComment;
          setActionComment(null);
          confirmDeleteComment(target);
        }}
        onReport={() => {
          if (!actionComment) return;
          setReportComment(actionComment);
          setActionComment(null);
        }}
      />

      <ReportBlockSheet
        visible={Boolean(reportComment)}
        onClose={() => setReportComment(null)}
        kind="comment"
        targetId={reportComment?.id ?? ''}
        targetLabel={
          reportComment
            ? `${reportComment.author}: ${reportComment.text.slice(0, 60)}`
            : undefined
        }
        blockUserId={reportComment?.author.trim().toLowerCase()}
      />
      </>
    );
  },
);

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: SHEET_WHITE,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  handle: {
    backgroundColor: 'rgba(22, 24, 35, 0.15)',
    width: 36,
  },
  header: {
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(22, 24, 35, 0.08)',
  },
  title: {
    textAlign: 'center',
    color: INK,
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
  },
  empty: {
    color: MUTED,
    textAlign: 'center',
    marginTop: 30,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  commentTap: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  replyRow: {
    paddingLeft: 28,
  },
  body: { flex: 1 },
  author: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  text: {
    color: INK,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
  time: {
    color: MUTED,
    fontSize: 11,
  },
  reply: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },
  likeCol: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 4,
  },
  likeCount: {
    color: MUTED,
    fontSize: 10,
  },
  footer: {
    backgroundColor: SHEET_WHITE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(22, 24, 35, 0.08)',
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  replyBannerText: {
    flex: 1,
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 8 : 10,
  },
  input: {
    flex: 1,
    backgroundColor: INPUT_BG,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    color: INK,
    fontSize: 15,
    lineHeight: 20,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: INPUT_BG,
  },
});
