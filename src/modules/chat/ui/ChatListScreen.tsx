import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  HIDDEN_CHAT_SECRET,
  useChatStore,
} from '@/modules/chat/state/chat-store';
import { useOpenChatStore } from '@/modules/chat/state/openchat-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import type { Conversation, ConversationKind, OpenChatGroup } from '@/modules/chat/domain/types';
import { ChatListItem } from './ChatListItem';
import { OpenChatGroupListItem } from './OpenChatGroupListItem';
import { ChatPlusMenu } from './ChatPlusMenu';
import { ContactPickerSheet } from './ContactPickerSheet';
import { CreateGroupSheet } from './CreateGroupSheet';
import { ChatItemActionSheet } from './ChatItemActionSheet';
import { MyQrSheet } from './MyQrSheet';
import { sortPinnedByRecent } from '@/modules/chat/data/chatActions';
import { ActiveNotesBar } from './ActiveNotesBar';
import { colors } from '@/shared/theme/colors';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import { chatInboxPalette } from './chatDayNight';

type FilterKey = 'all' | 'pinned' | ConversationKind | 'openchat';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pinned', label: '📌 ปักหมุด' },
  { key: 'friend', label: 'เพื่อน' },
  { key: 'group', label: 'กลุ่ม' },
  { key: 'official', label: 'ร้าน / ลูกค้า' },
  { key: 'openchat', label: 'โอเพนแชท' },
];

export function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const palette = chatInboxPalette();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [myQrOpen, setMyQrOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<Conversation | null>(null);
  const conversations = useChatStore((s) => s.conversations);
  const hiddenUnlocked = useChatStore((s) => s.hiddenUnlocked);
  const unlockHiddenChats = useChatStore((s) => s.unlockHiddenChats);
  const lockHiddenChats = useChatStore((s) => s.lockHiddenChats);
  const createGroup = useChatStore((s) => s.createGroup);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const markAllConversationsRead = useChatStore((s) => s.markAllConversationsRead);
  const markConversationUnread = useChatStore((s) => s.markConversationUnread);
  const togglePinConversation = useChatStore((s) => s.togglePinConversation);
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation);
  const archiveConversation = useChatStore((s) => s.archiveConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const hydrateInbox = useChatStore((s) => s.hydrateInbox);
  const hydratingInbox = useChatStore((s) => s.hydratingInbox);
  const groups = useOpenChatStore((s) => s.groups);
  const authUser = useAuthStore((s) => s.user);
  const blockedUserIds = useModerationStore((s) => s.blockedUserIds);
  const blockUser = useModerationStore((s) => s.blockUser);

  useFocusEffect(
    useCallback(() => {
      void hydrateInbox();
    }, [hydrateInbox]),
  );

  const visibleConversations = useMemo(() => {
    const blocked = new Set(blockedUserIds.map((id) => id.toLowerCase()));
    const base = conversations.filter((c) => {
      if (!(hiddenUnlocked || !c.isHidden) || c.isArchived) return false;
      const handle = (c.peerHandle ?? '').replace(/^@/, '').toLowerCase();
      return !blocked.has(handle) && !blocked.has((c.peerHandle ?? '').toLowerCase());
    });
    const q = query.trim().toLowerCase();
    if (!q || q === HIDDEN_CHAT_SECRET) return base;
    return base.filter(
      (c) =>
        c.peerName.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q),
    );
  }, [conversations, hiddenUnlocked, query, blockedUserIds]);

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
    setTimeout(() => setCreateGroupOpen(true), 280);
  };

  const finishCreateGroup = (name: string, members: Array<{ name: string; handle: string }>) => {
    const id = createGroup(name, members);
    jumpToChatThread(id);
  };

  const handleScanQr = () => {
    router.push('/qr-scan');
  };

  const handleMyQr = () => {
    setTimeout(() => setMyQrOpen(true), 280);
  };

  const handleNewChat = () => {
    setTimeout(() => setPickerOpen(true), 280);
  };

  const handleMarkAllRead = () => {
    markAllConversationsRead();
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
    Alert.alert('ลบแชท', 'ต้องการลบการสนทนานี้ออกจากรายการหรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ลบ', style: 'destructive', onPress: () => deleteConversation(id) },
    ]);
  };

  const handleBlockConversation = (id: string) => {
    const target = conversations.find((c) => c.id === id);
    if (!target) return;
    const handle = (target.peerHandle ?? '').replace(/^@/, '');
    Alert.alert('บล็อก', `บล็อก ${target.peerName}? จะไม่แสดงแชทและคอนเทนต์จากผู้ใช้นี้`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'บล็อก',
        style: 'destructive',
        onPress: () => {
          if (handle) blockUser(handle);
          deleteConversation(id);
        },
      },
    ]);
  };

  /** ค้นหา + โมเมนต์ + แท็บปักหมุด — ชิ้นเดียวเลื่อนขึ้นไปกับรายการแชต */
  const listHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.topBar}>
          <View
            style={[
              styles.searchRow,
              {
                backgroundColor: palette.searchBg,
                borderColor: palette.searchBorder,
              },
            ]}
          >
            <Ionicons name="search" size={18} color={palette.searchPlaceholder} />
            <TextInput
              style={[styles.search, { color: palette.searchText }]}
              placeholder="ค้นหา หรือพิมพ์รหัสลับ Hidden Chats"
              placeholderTextColor={palette.searchPlaceholder}
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
          <Pressable
            style={styles.addBtn}
            hitSlop={12}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="เพิ่ม"
          >
            <Ionicons name="add" size={36} color={palette.addIcon} />
          </Pressable>
        </View>

        {hiddenUnlocked ? (
          <View style={styles.hiddenBanner}>
            <Ionicons name="eye-off" size={14} color={colors.accent.vault} />
            <Text style={styles.hiddenBannerText}>แสดง Hidden Chats แล้ว</Text>
          </View>
        ) : null}

        <ActiveNotesBar />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          keyboardShouldPersistTaps="handled"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? palette.chipActiveBg : palette.chipBg,
                    borderColor: active ? palette.chipActiveBg : palette.chipBorder,
                  },
                ]}
                onPress={() => setFilter(f.key)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? palette.chipActiveText : palette.chipText },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    ),
    [filter, hiddenUnlocked, lockHiddenChats, palette, query],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4, backgroundColor: palette.canvas }]}>
      <FlatList<Conversation | OpenChatGroup>
        data={listData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        stickyHeaderIndices={[]}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => (
          <View style={[styles.sep, { backgroundColor: palette.sep }]} />
        )}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) =>
          'peerName' in item ? (
            <ChatListItem item={item} onLongPress={setActionTarget} />
          ) : (
            <OpenChatGroupListItem item={item} />
          )
        }
        ListEmptyComponent={
          hydratingInbox ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={palette.addIcon} />
              <Text style={[styles.emptyText, { color: palette.empty }]}>กำลังโหลดแชท…</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={36} color={palette.empty} />
              <Text style={[styles.emptyText, { color: palette.empty }]}>ไม่มีแชตในหมวดนี้</Text>
            </View>
          )
        }
      />

      <ChatPlusMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onCreateGroup={handleCreateGroup}
        onScanQr={handleScanQr}
        onMyQr={handleMyQr}
        onNewChat={handleNewChat}
        onMarkAllRead={handleMarkAllRead}
      />

      <ContactPickerSheet
        visible={pickerOpen}
        contacts={visibleConversations.filter((c) => (c.kind ?? 'friend') !== 'group')}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => jumpToChatThread(id)}
        onAddFriend={() => router.push('/(tabs)/chat/add-friend')}
      />

      <MyQrSheet
        visible={myQrOpen}
        displayName={authUser?.displayName ?? 'BoomMall'}
        handle={authUser?.handle ?? authUser?.id ?? 'me'}
        onClose={() => setMyQrOpen(false)}
      />

      <CreateGroupSheet
        visible={createGroupOpen}
        contacts={visibleConversations.filter((c) => (c.kind ?? 'friend') !== 'group')}
        onClose={() => setCreateGroupOpen(false)}
        onCreate={finishCreateGroup}
      />

      <ChatItemActionSheet
        visible={actionTarget !== null}
        conversation={actionTarget}
        onClose={() => setActionTarget(null)}
        onTogglePin={togglePinConversation}
        onToggleMute={toggleMuteConversation}
        onArchive={archiveConversation}
        onMarkRead={markConversationRead}
        onMarkUnread={markConversationUnread}
        onDelete={handleDeleteConversation}
        onBlock={handleBlockConversation}
        onOpen={(id) => jumpToChatThread(id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listHeader: {
    paddingBottom: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  search: {
    flex: 1,
    height: 44,
  },
  addBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
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
    marginBottom: 8,
  },
  chipsContent: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontWeight: '700',
    fontSize: 12,
  },
  list: {
    paddingBottom: 120,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
  },
});
