import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { useRecordSearch } from '@/modules/account/ui/useRecordSearch';
import { searchDirectory } from '@/modules/search/data/mockSearchDirectory';
import type { SearchResult } from '@/modules/search/domain/types';

function normalizeHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, '');
}

/**
 * Friend Onboarding & Chat Initiation — Search Bar.
 * Matches [ชื่อผู้ใช้ / ID], [ลิงก์ IG (@username)] and [เบอร์โทรศัพท์], with a QR-scan
 * shortcut and Facebook-style "send request → reveal 💬 ส่งข้อความ" add-friend flow.
 */
export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  useRecordSearch(query, 'ผู้ใช้');
  const conversations = useChatStore((s) => s.conversations);
  const addFriend = useChatStore((s) => s.addFriend);

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [addedConvByResultId, setAddedConvByResultId] = useState<Record<string, string>>({});

  const results = useMemo(() => searchDirectory(query), [query]);

  const conversationForHandle = (handle: string) =>
    conversations.find((c) => normalizeHandle(c.peerHandle) === normalizeHandle(handle));

  const openChat = (conversationId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    jumpToChatThread(conversationId);
  };

  const sendFriendRequest = (result: SearchResult) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingId(result.id);
    // Mock network round-trip so the UX genuinely feels like "ส่งคำขอ" → "ตอบรับ" (Facebook-style).
    setTimeout(() => {
      const conversationId = addFriend(result.displayName, result.handle);
      setSendingId(null);
      setAddedConvByResultId((prev) => ({ ...prev, [result.id]: conversationId }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 650);
  };

  const renderItem = ({ item }: { item: SearchResult }) => {
    const existing = conversationForHandle(item.handle);
    const justAddedConvId = addedConvByResultId[item.id];
    const conversationId = existing?.id ?? justAddedConvId;
    const isSending = sendingId === item.id;

    return (
      <View style={styles.row}>
        <Avatar
          initial={item.displayName.slice(0, 1)}
          backgroundColor={item.avatarColor}
          size={48}
        />
        <View style={styles.rowBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
            {item.verified ? (
              <Ionicons name="checkmark-circle" size={14} color={colors.brand.primaryDark} />
            ) : null}
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>@{item.handle} · {item.subtitle}</Text>
        </View>

        {conversationId ? (
          <Pressable style={styles.chatBtn} onPress={() => openChat(conversationId)}>
            <Ionicons name="chatbubble-ellipses" size={14} color={colors.brand.ink} />
            <Text style={styles.chatBtnText}>ส่งข้อความ</Text>
          </Pressable>
        ) : isSending ? (
          <View style={styles.sendingBtn}>
            <Text style={styles.sendingBtnText}>กำลังส่งคำขอ...</Text>
          </View>
        ) : (
          <Pressable style={styles.addBtn} onPress={() => sendFriendRequest(item)}>
            <Ionicons name="person-add" size={14} color={colors.text.primary} />
            <Text style={styles.addBtnText}>เพิ่มเพื่อน</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.searchRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>

        <View style={styles.inputWrap}>
          <Ionicons name="search" size={17} color={colors.text.muted} />
          <TextInput
            style={styles.input}
            placeholder="ชื่อผู้ใช้ / ID, @IG, เบอร์โทรศัพท์"
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push('/qr-scan')}
          hitSlop={8}
        >
          <Ionicons name="qr-code" size={20} color={colors.text.primary} />
        </Pressable>

        <Pressable
          style={[styles.iconBtn, styles.plusBtn]}
          onPress={() => router.push('/(tabs)/chat/add-friend')}
          hitSlop={8}
        >
          <Ionicons name="add" size={20} color={colors.brand.ink} />
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>
        {query ? `ผลการค้นหา (${results.length})` : 'ผู้ติดต่อแนะนำ'}
      </Text>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={36} color={colors.text.muted} />
            <Text style={styles.emptyText}>ไม่พบผู้ใช้ / ร้านค้าที่ตรงกับ “{query}”</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  backBtn: {
    width: 28,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  input: {
    flex: 1,
    height: 42,
    color: colors.text.primary,
    fontSize: 14,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  plusBtn: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontWeight: '800',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  rowBody: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    color: colors.text.primary,
    fontWeight: '800',
    fontSize: 14,
    flexShrink: 1,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.surface.canvas,
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  addBtnText: {
    color: colors.text.primary,
    fontWeight: '800',
    fontSize: 12,
  },
  sendingBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.surface.canvas,
  },
  sendingBtnText: {
    color: colors.text.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.brand.primary,
  },
  chatBtnText: {
    color: colors.brand.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
