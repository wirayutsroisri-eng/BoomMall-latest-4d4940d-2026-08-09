import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSharedValue } from 'react-native-reanimated';
import { Avatar } from '@/shared/components/Avatar';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { quotePreviewImage, quotePreviewLabel } from '@/modules/chat/domain/quotePreview';
import { isCurrentChatUser } from '@/modules/chat/data/chatRealtimeApi';
import {
  CHAT_REPORT_REASONS,
  CHAT_SEARCH_FILTERS,
  CHAT_WALLPAPERS,
  type ChatSearchFilter,
} from '@/modules/chat/domain/chatReportReasons';
import type { ChatMessage, Conversation } from '@/modules/chat/domain/types';

type Page = 'home' | 'search' | 'report' | 'wallpaper' | 'members' | 'favorites';

type Props = {
  visible: boolean;
  conversationId: string;
  onClose: () => void;
  initialPage?: Page;
  initialQuery?: string;
  onOpenMessage?: (messageId: string) => void;
};

const EMPTY_MESSAGES: ChatMessage[] = [];
const SWITCH_TRACK = { false: '#E5E5EA', true: '#34C759' };

function infoTitle(conversation: Conversation) {
  if (conversation.shopId || conversation.kind === 'official' || conversation.inboxRole) {
    return 'รายละเอียดธุรกรรม';
  }
  if (conversation.kind === 'group') return 'รายละเอียดกลุ่ม';
  return 'รายละเอียดแชท';
}

function matchesSearch(message: ChatMessage, filter: ChatSearchFilter | null, query: string) {
  const q = query.trim().toLowerCase();
  const hay = `${message.text ?? ''} ${message.fileName ?? ''} ${quotePreviewLabel(message)}`.toLowerCase();
  const textHit = !q || hay.includes(q);

  switch (filter) {
    case 'media':
      return message.kind === 'image' && (!q || textHit || q.includes('รูป'));
    case 'file':
      return message.kind === 'file' && textHit;
    case 'url':
      return /https?:\/\//i.test(message.text ?? '') && textHit;
    case 'audio':
      return message.kind === 'voice' && textHit;
    case 'transaction':
      return (
        (message.kind === 'quotation' || message.kind === 'product' || message.kind === 'order_ref') &&
        textHit
      );
    case 'shop':
      return (message.kind === 'product' || message.kind === 'content_ref') && textHit;
    case 'miniprogram':
    case 'channel':
    case 'gift':
      return false;
    case 'date':
      return textHit;
    default:
      return textHit;
  }
}

export function ChatInfoSheet({
  visible,
  conversationId,
  onClose,
  initialPage = 'home',
  initialQuery = '',
  onOpenMessage,
}: Props) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const searchRef = useRef<TextInput>(null);
  const [page, setPage] = useState<Page>('home');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatSearchFilter | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const conversation = useChatStore((s) => s.getConversation(conversationId));
  const messages = useChatStore((s) => s.messagesById[conversationId] ?? EMPTY_MESSAGES);
  const contacts = useChatStore((s) => s.conversations);
  const toggleMute = useChatStore((s) => s.toggleMuteConversation);
  const togglePin = useChatStore((s) => s.togglePinConversation);
  const toggleAlerts = useChatStore((s) => s.toggleAlerts);
  const setWallpaper = useChatStore((s) => s.setWallpaper);
  const clearHistory = useChatStore((s) => s.clearConversationHistory);
  const inviteFriends = useChatStore((s) => s.inviteFriendsToChat);
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const submitReport = useModerationStore((s) => s.submitReport);
  const blockUser = useModerationStore((s) => s.blockUser);
  const authUser = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!visible) {
      setPage('home');
      setQuery('');
      setFilter(null);
      setPicked(new Set());
      scrollY.value = 0;
      return;
    }
    setPage(initialPage);
    setQuery(initialQuery);
  }, [visible, initialPage, initialQuery, scrollY]);

  useEffect(() => {
    if (visible && page === 'search') {
      const t = setTimeout(() => searchRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [visible, page]);

  const inviteCandidates = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.id !== conversationId &&
          !c.isArchived &&
          !c.isHidden &&
          c.kind !== 'group' &&
          c.kind !== 'official',
      ),
    [contacts, conversationId],
  );

  const searchHits = useMemo(() => {
    if (!filter && !query.trim()) return [];
    return messages.filter((m) => matchesSearch(m, filter, query));
  }, [filter, messages, query]);

  const favorites = useMemo(
    () => messages.filter((m) => m.isFavorite).slice().reverse(),
    [messages],
  );

  if (!conversation) return null;

  const goHome = () => setPage('home');
  const closeAll = () => {
    setPage('home');
    onClose();
  };

  const onReport = (reason: string) => {
    submitReport({
      kind: 'user',
      targetId: conversation.peerHandle || conversationId,
      targetLabel: conversation.peerName,
      reason,
    });
    void import('@/modules/safety/syncModerationContentBlocks').then(({ submitReportToServer }) =>
      submitReportToServer({
        kind: 'user',
        targetId: conversation.peerHandle || conversationId,
        targetLabel: conversation.peerName,
        reason,
        reporterRef: authUser?.id ?? 'mobile-anon',
      }),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const blockId = conversation.peerHandle || conversationId;
    Alert.alert('ส่งรายงานแล้ว', 'ทีม moderation จะตรวจสอบตามคิว', [
      { text: 'ปิด', style: 'cancel', onPress: closeAll },
      {
        text: 'บล็อกผู้ใช้นี้',
        style: 'destructive',
        onPress: () => {
          blockUser(blockId);
          closeAll();
        },
      },
    ]);
  };

  const onClear = () => {
    Alert.alert('ล้างประวัติสนทนา', 'ข้อความในห้องนี้จะถูกลบออกจากอุปกรณ์', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ล้าง',
        style: 'destructive',
        onPress: () => {
          clearHistory(conversationId);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          closeAll();
        },
      },
    ]);
  };

  const confirmInvite = () => {
    const members = inviteCandidates
      .filter((c) => picked.has(c.id))
      .map((c) => ({
        name: c.peerName,
        handle: (c.peerHandle ?? '').replace(/^@/, '') || c.id,
      }));
    if (!members.length) return;
    const nextId = inviteFriends(conversationId, members);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeAll();
    if (nextId !== conversationId) jumpToChatThread(nextId);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeAll}>
      <DragDownDismiss
        onDismiss={closeAll}
        showDim
        rootInModal
        scrollY={scrollY}
        rootStyle={styles.flex}
        style={[styles.sheet, { paddingTop: insets.top }]}
      >
        {page === 'search' ? (
          <SearchPage
            query={query}
            filter={filter}
            hits={searchHits}
            inputRef={searchRef}
            onQuery={setQuery}
            onFilter={(key) => {
              void Haptics.selectionAsync();
              setFilter((prev) => (prev === key ? null : key));
            }}
            onCancel={goHome}
            onScrollY={(y) => {
              scrollY.value = y;
            }}
          />
        ) : page === 'report' ? (
          <ReportPage onClose={goHome} onPick={onReport} />
        ) : page === 'wallpaper' ? (
          <WallpaperPage
            current={conversation.wallpaper}
            onBack={goHome}
            onPick={(color) => {
              void Haptics.selectionAsync();
              setWallpaper(conversationId, color);
            }}
          />
        ) : page === 'members' ? (
          <MembersPage
            candidates={inviteCandidates}
            picked={picked}
            onToggle={(id) => {
              void Haptics.selectionAsync();
              setPicked((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onBack={goHome}
            onConfirm={confirmInvite}
          />
        ) : page === 'favorites' ? (
          <FavoritesPage
            items={favorites}
            peerName={conversation.peerName}
            onBack={goHome}
            onOpen={(id) => {
              closeAll();
              onOpenMessage?.(id);
            }}
            onRemove={(id) => {
              void Haptics.selectionAsync();
              toggleFavorite(conversationId, id);
            }}
            onScrollY={(y) => {
              scrollY.value = y;
            }}
          />
        ) : (
          <HomePage
            conversation={conversation}
            title={infoTitle(conversation)}
            favoriteCount={favorites.length}
            onBack={closeAll}
            onSearch={() => setPage('search')}
            onFavorites={() => setPage('favorites')}
            onReport={() => setPage('report')}
            onWallpaper={() => setPage('wallpaper')}
            onAddMembers={() => setPage('members')}
            onToggleMute={() => {
              void Haptics.selectionAsync();
              toggleMute(conversationId);
            }}
            onTogglePin={() => {
              void Haptics.selectionAsync();
              togglePin(conversationId);
            }}
            onToggleAlerts={() => {
              void Haptics.selectionAsync();
              toggleAlerts(conversationId);
            }}
            onClear={onClear}
            onScrollY={(y) => {
              scrollY.value = y;
            }}
          />
        )}
      </DragDownDismiss>
    </Modal>
  );
}

function HomePage({
  conversation,
  title,
  favoriteCount,
  onBack,
  onSearch,
  onFavorites,
  onReport,
  onWallpaper,
  onAddMembers,
  onToggleMute,
  onTogglePin,
  onToggleAlerts,
  onClear,
  onScrollY,
}: {
  conversation: Conversation;
  title: string;
  favoriteCount: number;
  onBack: () => void;
  onSearch: () => void;
  onFavorites: () => void;
  onReport: () => void;
  onWallpaper: () => void;
  onAddMembers: () => void;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onToggleAlerts: () => void;
  onClear: () => void;
  onScrollY: (y: number) => void;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.nav}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="กลับ">
          <Ionicons name="chevron-back" size={26} color="#111" />
        </Pressable>
        <Text style={styles.navTitle}>{title}</Text>
        <View style={styles.navSpacer} />
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.homeScroll}
        onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.membersRow}>
          <View style={styles.memberCell}>
            <Avatar
              uri={conversation.avatarUri}
              initial={conversation.peerName.slice(0, 1)}
              backgroundColor={conversation.avatarColor}
              size={56}
              radius={12}
              borderWidth={0}
            />
            <Text style={styles.memberName} numberOfLines={1}>
              {conversation.peerName}
            </Text>
          </View>
          <Pressable style={styles.memberCell} onPress={onAddMembers} accessibilityLabel="เพิ่มสมาชิก">
            <View style={styles.addMember}>
              <Ionicons name="add" size={28} color="#8E8E93" />
            </View>
            <Text style={styles.memberName}> </Text>
          </Pressable>
        </View>

        <View style={styles.group}>
          <NavRow label="ค้นหาประวัติ" onPress={onSearch} />
          <NavRow
            label="รายการโปรด"
            hint={favoriteCount ? String(favoriteCount) : undefined}
            onPress={onFavorites}
          />
          <ToggleRow
            label="ปิดเสียงการแจ้งเตือน"
            value={Boolean(conversation.isMuted)}
            onValueChange={onToggleMute}
          />
          <ToggleRow
            label="ปักหมุดไว้บนสุด"
            value={Boolean(conversation.isPinned)}
            onValueChange={onTogglePin}
          />
          <ToggleRow
            label="การเตือน"
            value={Boolean(conversation.alertsOn)}
            onValueChange={onToggleAlerts}
            last
          />
        </View>

        <View style={styles.group}>
          <NavRow label="พื้นหลัง" onPress={onWallpaper} last />
        </View>

        <View style={styles.group}>
          <Pressable style={styles.row} onPress={onClear}>
            <Text style={styles.rowLabel}>ล้างประวัติสนทนา</Text>
          </Pressable>
          <NavRow label="รายงาน" onPress={onReport} last />
        </View>
      </ScrollView>
    </View>
  );
}

function SearchPage({
  query,
  filter,
  hits,
  inputRef,
  onQuery,
  onFilter,
  onCancel,
  onScrollY,
}: {
  query: string;
  filter: ChatSearchFilter | null;
  hits: ChatMessage[];
  inputRef: React.RefObject<TextInput | null>;
  onQuery: (v: string) => void;
  onFilter: (key: ChatSearchFilter) => void;
  onCancel: () => void;
  onScrollY: (y: number) => void;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.searchHeader}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={16} color="#8E8E93" />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={onQuery}
            placeholder="ค้นหา"
            placeholderTextColor="#8E8E93"
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.cancel}>ยกเลิก</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        contentContainerStyle={styles.searchScroll}
      >
        <Text style={styles.quickTitle}>ค้นหาการสนทนาอย่างรวดเร็ว</Text>
        <View style={styles.quickGrid}>
          {CHAT_SEARCH_FILTERS.map((item) => (
            <Pressable
              key={item.key}
              style={styles.quickCell}
              onPress={() => onFilter(item.key)}
            >
              <Text style={[styles.quickLabel, filter === item.key && styles.quickLabelOn]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {filter || query.trim() ? (
          hits.length ? (
            hits.map((m) => (
              <View key={m.id} style={styles.hitRow}>
                <Text style={styles.hitKind}>{kindLabel(m)}</Text>
                <Text style={styles.hitText} numberOfLines={2}>
                  {quotePreviewLabel(m)}
                </Text>
                <Text style={styles.hitTime}>{m.createdAt}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>ไม่พบรายการ</Text>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

function ReportPage({ onClose, onPick }: { onClose: () => void; onPick: (reason: string) => void }) {
  return (
    <View style={styles.flex}>
      <View style={styles.nav}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="ปิด">
          <Ionicons name="close" size={26} color="#111" />
        </Pressable>
        <Text style={styles.navTitle}>เลือกเหตุผลที่รายงาน</Text>
        <View style={styles.navSpacer} />
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.reportScroll}>
        {CHAT_REPORT_REASONS.map((reason, i) => (
          <Pressable
            key={reason}
            style={[styles.reportRow, i === CHAT_REPORT_REASONS.length - 1 && styles.rowLast]}
            onPress={() => {
              void Haptics.selectionAsync();
              onPick(reason);
            }}
          >
            <Text style={styles.reportLabel}>{reason}</Text>
            <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function WallpaperPage({
  current,
  onBack,
  onPick,
}: {
  current?: string;
  onBack: () => void;
  onPick: (color?: string) => void;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.nav}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="กลับ">
          <Ionicons name="chevron-back" size={26} color="#111" />
        </Pressable>
        <Text style={styles.navTitle}>พื้นหลัง</Text>
        <View style={styles.navSpacer} />
      </View>
      <View style={styles.wallGrid}>
        {CHAT_WALLPAPERS.map((item) => {
          const selected =
            (item.color === undefined && !current) || item.color === current;
          return (
            <Pressable
              key={item.id}
              style={styles.wallCell}
              onPress={() => onPick(item.color)}
            >
              <View
                style={[
                  styles.wallSwatch,
                  { backgroundColor: item.swatch },
                  selected && styles.wallSwatchOn,
                ]}
              />
              <Text style={styles.wallLabel}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MembersPage({
  candidates,
  picked,
  onToggle,
  onBack,
  onConfirm,
}: {
  candidates: Conversation[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.nav}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="กลับ">
          <Ionicons name="chevron-back" size={26} color="#111" />
        </Pressable>
        <Text style={styles.navTitle}>เชิญเพื่อน</Text>
        <Pressable onPress={onConfirm} disabled={picked.size === 0}>
          <Text style={[styles.inviteDone, picked.size === 0 && styles.inviteDoneOff]}>เพิ่ม</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.memberList}>
        {candidates.map((c) => {
          const on = picked.has(c.id);
          return (
            <Pressable key={c.id} style={styles.pickRow} onPress={() => onToggle(c.id)}>
              <Avatar
                uri={c.avatarUri}
                initial={c.peerName.slice(0, 1)}
                backgroundColor={c.avatarColor}
                size={40}
                radius={10}
                borderWidth={0}
              />
              <Text style={styles.pickName}>{c.peerName}</Text>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={on ? colors.brand.primaryDark : '#C7C7CC'}
              />
            </Pressable>
          );
        })}
        {candidates.length === 0 ? <Text style={styles.empty}>ยังไม่มีเพื่อนให้เชิญ</Text> : null}
      </ScrollView>
    </View>
  );
}

function FavoritesPage({
  items,
  peerName,
  onBack,
  onOpen,
  onRemove,
  onScrollY,
}: {
  items: ChatMessage[];
  peerName: string;
  onBack: () => void;
  onOpen: (messageId: string) => void;
  onRemove: (messageId: string) => void;
  onScrollY: (y: number) => void;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.nav}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="กลับ">
          <Ionicons name="chevron-back" size={26} color="#111" />
        </Pressable>
        <Text style={styles.navTitle}>รายการโปรด</Text>
        <View style={styles.navSpacer} />
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.favScroll}
        onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {items.length === 0 ? (
          <Text style={styles.empty}>ยังไม่มีรายการโปรดในห้องนี้{'\n'}กดค้างที่ข้อความในแชต แล้วเลือก รายการโปรด</Text>
        ) : (
          items.map((m) => {
            const thumb = quotePreviewImage(m);
            const mine = isCurrentChatUser(m.senderId);
            return (
              <Pressable key={m.id} style={styles.favRow} onPress={() => onOpen(m.id)}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.favThumb} />
                ) : (
                  <View style={styles.favIcon}>
                    <Ionicons name="cube" size={18} color="#07C160" />
                  </View>
                )}
                <View style={styles.favBody}>
                  <Text style={styles.favFrom} numberOfLines={1}>
                    {mine ? 'ฉัน' : peerName}
                  </Text>
                  <Text style={styles.favText} numberOfLines={2}>
                    {quotePreviewLabel(m)}
                  </Text>
                  <Text style={styles.favTime}>{m.createdAt}</Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    Alert.alert('นำออกจากรายการโปรด?', 'ข้อความยังอยู่ในแชต', [
                      { text: 'ยกเลิก', style: 'cancel' },
                      { text: 'ลบ', style: 'destructive', onPress: () => onRemove(m.id) },
                    ]);
                  }}
                  accessibilityLabel="นำออกจากรายการโปรด"
                >
                  <Ionicons name="close-circle" size={22} color="#C7C7CC" />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function NavRow({
  label,
  hint,
  onPress,
  last,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  last,
}: {
  label: string;
  value: boolean;
  onValueChange: () => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={SWITCH_TRACK}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#E5E5EA"
      />
    </View>
  );
}

function kindLabel(message: ChatMessage) {
  switch (message.kind) {
    case 'image':
      return 'รูปภาพ';
    case 'file':
      return 'ไฟล์';
    case 'voice':
      return 'เสียง';
    case 'quotation':
    case 'product':
      return 'ธุรกรรม';
    default:
      return 'ข้อความ';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F2F2F7',
  },
  nav: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  navSpacer: { width: 26 },
  homeScroll: { paddingBottom: 40 },
  membersRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  memberCell: { width: 64, alignItems: 'center', gap: 6 },
  memberName: { fontSize: 12, color: '#111', width: 64, textAlign: 'center' },
  addMember: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 16, color: '#111', flex: 1, paddingRight: 12 },
  rowHint: { fontSize: 15, color: '#8E8E93', marginRight: 4 },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F2F2F7',
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: { flex: 1, fontSize: 16, color: '#111', paddingVertical: 0 },
  cancel: { fontSize: 17, color: '#007AFF' },
  searchScroll: { paddingBottom: 40 },
  quickTitle: {
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 18,
    marginBottom: 10,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  quickCell: {
    width: '33.33%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  quickLabel: { fontSize: 16, color: '#007AFF' },
  quickLabelOn: { fontWeight: '700' },
  hitRow: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  hitKind: { fontSize: 11, fontWeight: '700', color: '#8E8E93', marginBottom: 2 },
  hitText: { fontSize: 15, color: '#111' },
  hitTime: { fontSize: 12, color: '#8E8E93', marginTop: 4 },
  empty: { textAlign: 'center', color: '#8E8E93', marginTop: 24, fontSize: 15, lineHeight: 22, paddingHorizontal: 24 },
  favScroll: { paddingBottom: 40 },
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  favThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#E5E5EA',
  },
  favIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favBody: { flex: 1, minWidth: 0 },
  favFrom: { fontSize: 12, fontWeight: '700', color: '#8E8E93', marginBottom: 2 },
  favText: { fontSize: 15, color: '#111' },
  favTime: { fontSize: 12, color: '#8E8E93', marginTop: 4 },
  reportScroll: { backgroundColor: '#FFFFFF' },
  reportRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  reportLabel: { flex: 1, fontSize: 16, color: '#111', lineHeight: 22 },
  wallGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  wallCell: { width: 88, alignItems: 'center', gap: 8 },
  wallSwatch: {
    width: 72,
    height: 96,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  wallSwatchOn: { borderWidth: 2, borderColor: '#34C759' },
  wallLabel: { fontSize: 12, color: '#111' },
  memberList: { backgroundColor: '#FFFFFF' },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  pickName: { flex: 1, fontSize: 16, color: '#111' },
  inviteDone: { fontSize: 17, fontWeight: '600', color: '#007AFF', paddingHorizontal: 8 },
  inviteDoneOff: { color: '#C7C7CC' },
});
