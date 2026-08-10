import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  HIDDEN_CHAT_SECRET,
  useChatStore,
} from '@/modules/chat/state/chat-store';
import { useOpenChatStore } from '@/modules/chat/state/openchat-store';
import { useCallStore } from '@/modules/chat/state/call-store';
import { QUOTATION_TEMPLATES } from '@/modules/chat/data/mockQuotationTemplates';
import type { Conversation, ConversationKind, OpenChatGroup } from '@/modules/chat/domain/types';
import { ChatListItem } from './ChatListItem';
import { OpenChatGroupListItem } from './OpenChatGroupListItem';
import { ChatPlusMenu } from './ChatPlusMenu';
import { ContactPickerSheet } from './ContactPickerSheet';
import { ChatItemActionSheet } from './ChatItemActionSheet';
import { sortPinnedByRecent } from '@/modules/chat/data/chatActions';
import { ActiveNotesBar } from './ActiveNotesBar';
import { colors } from '@/shared/theme/colors';

type FilterKey = 'all' | 'pinned' | ConversationKind | 'openchat';

const HEADER_SPRING = { damping: 20, stiffness: 220, mass: 0.5 };
const SCROLL_DIRECTION_THRESHOLD = 6;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pinned', label: '📌 ปักหมุด' },
  { key: 'friend', label: 'เพื่อน' },
  { key: 'group', label: 'กลุ่ม' },
  { key: 'official', label: 'บัญชีทางการ' },
  { key: 'openchat', label: 'โอเพนแชท' },
];

export function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<null | 'call' | 'quotation'>(null);
  const [actionTarget, setActionTarget] = useState<Conversation | null>(null);
  const conversations = useChatStore((s) => s.conversations);
  const hiddenUnlocked = useChatStore((s) => s.hiddenUnlocked);
  const unlockHiddenChats = useChatStore((s) => s.unlockHiddenChats);
  const lockHiddenChats = useChatStore((s) => s.lockHiddenChats);
  const createGroup = useChatStore((s) => s.createGroup);
  const sendQuotation = useChatStore((s) => s.sendQuotation);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const togglePinConversation = useChatStore((s) => s.togglePinConversation);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);
  const archiveConversation = useChatStore((s) => s.archiveConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const groups = useOpenChatStore((s) => s.groups);
  const startCall = useCallStore((s) => s.startCall);

  // Full natural height of the header block (title row + search + chips), measured continuously
  // from the un-clipped inner content so it stays accurate even while the outer wrap is collapsing.
  const headerHeight = useSharedValue(0);
  const headerProgress = useSharedValue(1); // 1 = fully shown, 0 = fully collapsed
  const lastScrollY = useSharedValue(0);

  const onHeaderLayout = useCallback(
    (e: LayoutChangeEvent) => {
      headerHeight.value = e.nativeEvent.layout.height;
    },
    [headerHeight],
  );

  // Outer wrap clips the header out of the layout flow so the list below reflows to fill the space.
  const headerOuterAnimatedStyle = useAnimatedStyle(() => ({
    height: headerHeight.value === 0 ? undefined : headerHeight.value * headerProgress.value,
  }));

  // Inner content slides fully up and fades out in lockstep with the outer height collapse, so the
  // whole header block (search bar + Active Notes + filter chips) disappears completely against the
  // top edge with nothing left on screen, letting the chat list fill 100% of the viewport.
  const headerInnerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerProgress.value,
    transform: [{ translateY: (headerProgress.value - 1) * headerHeight.value }],
  }));

  const onListScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      const diff = y - lastScrollY.value;
      if (y <= 0) {
        // ลากดึงจนสุดด้านบน — แสดง Header กลับมาเต็ม 100%
        headerProgress.value = withSpring(1, HEADER_SPRING);
      } else if (diff > SCROLL_DIRECTION_THRESHOLD) {
        // สกรอลล์เลื่อนลง (ดูรายการถัดไป) — ยุบซ่อน Header ขึ้นด้านบนพร้อม Fade Out
        headerProgress.value = withSpring(0, HEADER_SPRING);
      } else if (diff < -SCROLL_DIRECTION_THRESHOLD) {
        // สกรอลล์เลื่อนขึ้น — เลื่อน Header กลับลงมาพร้อม Fade In
        headerProgress.value = withSpring(1, HEADER_SPRING);
      }
      lastScrollY.value = y;
    },
  });

  const visibleConversations = useMemo(() => {
    const base = conversations.filter(
      (c) => (hiddenUnlocked || !c.isHidden) && !c.isArchived,
    );
    const q = query.trim().toLowerCase();
    if (!q || q === HIDDEN_CHAT_SECRET) return base;
    return base.filter(
      (c) =>
        c.peerName.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q),
    );
  }, [conversations, hiddenUnlocked, query]);

  const filteredConversations = useMemo(() => {
    if (filter === 'openchat') return [];
    if (filter === 'pinned') {
      return sortPinnedByRecent(visibleConversations.filter((c) => c.isPinned));
    }
    if (filter === 'all') return visibleConversations;
    return visibleConversations.filter((c) => (c.kind ?? 'friend') === filter);
  }, [visibleConversations, filter]);

  const listData: Array<Conversation | OpenChatGroup> =
    filter === 'openchat' ? groups : filteredConversations;

  const handleCreateGroup = () => {
    Alert.prompt(
      'สร้างกลุ่มใหม่',
      'ตั้งชื่อกลุ่มแชตของคุณ (Group Chat)',
      (name) => {
        const trimmed = name?.trim();
        if (!trimmed) return;
        const id = createGroup(trimmed, 1);
        router.push(`/(tabs)/chat/${id}`);
      },
      'plain-text',
    );
  };

  const handleStartCall = (peerName: string, type: 'voice' | 'video') => {
    startCall(peerName, type);
  };

  const handleQuotation = (conversationId: string) => {
    const template = QUOTATION_TEMPLATES[Math.floor(Math.random() * QUOTATION_TEMPLATES.length)];
    sendQuotation(conversationId, {
      id: `q-quick-${Date.now()}`,
      title: template.title,
      description: template.description,
      amount: template.amount,
      currency: 'THB',
      status: 'pending',
      expiresAt: 'วันนี้ 23:59',
    });
    router.push(`/(tabs)/chat/${conversationId}`);
  };

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (text.trim().toLowerCase() === HIDDEN_CHAT_SECRET) {
      const ok = unlockHiddenChats(text);
      if (ok) {
        Alert.alert('Hidden Chats ปลดล็อก', 'ห้องแชตลับปรากฏแล้ว — รหัสในช่องค้นหาทำงาน');
      }
    }
  };

  const handleDeleteConversation = (id: string) => {
    Alert.alert('ลบแชต', 'ต้องการลบการสนทนานี้ออกจากรายการหรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: () => deleteConversation(id) },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <Animated.View style={[styles.headerCollapseOuter, headerOuterAnimatedStyle]}>
        <Animated.View onLayout={onHeaderLayout} style={headerInnerAnimatedStyle}>
          <View style={styles.topBar}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color={colors.text.muted} />
              <TextInput
                style={styles.search}
                placeholder="ค้นหา หรือพิมพ์รหัสลับ Hidden Chats"
                placeholderTextColor={colors.text.muted}
                value={query}
                onChangeText={onChangeQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {hiddenUnlocked ? (
                <Pressable onPress={lockHiddenChats}>
                  <Text style={styles.lockHidden}>ซ่อน</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable style={styles.addBtn} hitSlop={8} onPress={() => setMenuOpen(true)}>
              <Ionicons name="add" size={24} color={colors.brand.ink} />
            </Pressable>
          </View>

          {hiddenUnlocked ? (
            <View style={styles.hiddenBanner}>
              <Ionicons name="eye-off" size={14} color={colors.accent.vault} />
              <Text style={styles.hiddenBannerText}>แสดง Hidden Chats แล้ว</Text>
            </View>
          ) : null}

          <ActiveNotesBar />

          <FlatList
            data={FILTERS}
            keyExtractor={(f) => f.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsRow}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
            renderItem={({ item: f }) => (
              <Pressable
                style={[styles.chip, filter === f.key && styles.chipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            )}
          />
        </Animated.View>
      </Animated.View>

      <Animated.FlatList<Conversation | OpenChatGroup>
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onScroll={onListScroll}
        scrollEventThrottle={16}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) =>
          'peerName' in item ? (
            <ChatListItem item={item} onLongPress={setActionTarget} />
          ) : (
            <OpenChatGroupListItem item={item} />
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={36} color={colors.text.muted} />
            <Text style={styles.emptyText}>ไม่มีแชตในหมวดนี้</Text>
          </View>
        }
      />

      <ChatPlusMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onCreateGroup={handleCreateGroup}
        onAddFriend={() => router.push('/(tabs)/chat/add-friend')}
        onStartCall={() => setPicker('call')}
        onQuotation={() => setPicker('quotation')}
      />

      <ContactPickerSheet
        visible={picker !== null}
        mode={picker ?? 'call'}
        contacts={visibleConversations.filter((c) => (c.kind ?? 'friend') !== 'group')}
        onClose={() => setPicker(null)}
        onPickForCall={handleStartCall}
        onPickForQuotation={handleQuotation}
      />

      <ChatItemActionSheet
        visible={actionTarget !== null}
        conversation={actionTarget}
        onClose={() => setActionTarget(null)}
        onTogglePin={togglePinConversation}
        onToggleMute={toggleMuteConversation}
        onArchive={archiveConversation}
        onMarkRead={markConversationRead}
        onDelete={handleDeleteConversation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
    paddingHorizontal: 16,
  },
  headerCollapseOuter: {
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  search: {
    flex: 1,
    height: 44,
    color: colors.text.primary,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockHidden: {
    color: colors.accent.vault,
    fontWeight: '800',
    fontSize: 12,
  },
  hiddenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  hiddenBannerText: {
    color: colors.accent.vault,
    fontWeight: '700',
    fontSize: 12,
  },
  chipsRow: {
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  chipActive: {
    backgroundColor: colors.brand.ink,
    borderColor: colors.brand.ink,
  },
  chipText: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.text.secondary,
  },
  chipTextActive: {
    color: colors.brand.primary,
  },
  list: {
    paddingBottom: 120,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 10,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
  },
});
