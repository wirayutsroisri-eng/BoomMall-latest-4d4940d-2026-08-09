import React, { useCallback, useMemo, useState } from 'react';
import {
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
import { ENABLE_CALLS } from '@/shared/compliance/appStoreGates';
import { useModerationStore } from '@/modules/safety/state/moderation-store';

type FilterKey = 'all' | 'pinned' | ConversationKind | 'openchat';

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
  const blockedUserIds = useModerationStore((s) => s.blockedUserIds);

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
    if (!ENABLE_CALLS) {
      Alert.alert('การโทรยังไม่พร้อม', 'ยังไม่มีระบบโทรศัพท์ในเวอร์ชันนี้');
      return;
    }
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

  /** ค้นหา + โมเมนต์ + แท็บปักหมุด — ชิ้นเดียวเลื่อนขึ้นไปกับรายการแชต */
  const listHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.topBar}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.45)" />
            <TextInput
              style={styles.search}
              placeholder="ค้นหา หรือพิมพ์รหัสลับ Hidden Chats"
              placeholderTextColor="rgba(255,255,255,0.4)"
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
            <Ionicons name="add" size={36} color="#FFFFFF" style={styles.addGlow} />
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
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              style={[styles.chip, filter === f.key && styles.chipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    ),
    [filter, hiddenUnlocked, lockHiddenChats, query],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <FlatList<Conversation | OpenChatGroup>
        data={listData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        stickyHeaderIndices={[]}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) =>
          'peerName' in item ? (
            <ChatListItem item={item} onLongPress={setActionTarget} />
          ) : (
            <OpenChatGroupListItem item={item} />
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={36} color="rgba(255,255,255,0.35)" />
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
    backgroundColor: '#000000',
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
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border.onDark,
  },
  search: {
    flex: 1,
    height: 44,
    color: colors.text.inverse,
  },
  addBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  addGlow: {
    textShadowColor: 'rgba(255,255,255,0.55)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
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
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: colors.border.onDark,
  },
  chipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: {
    fontWeight: '700',
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
  },
  chipTextActive: {
    color: colors.brand.ink,
  },
  list: {
    paddingBottom: 120,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.onDark,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 10,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
});
