import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/shared/components/Avatar';
import { useChatStore } from '@/modules/chat/state/chat-store';
import type { Conversation } from '@/modules/chat/domain/types';

type Props = {
  active: boolean;
  onVerticalScroll?: (offsetY: number) => void;
};

export function NearbyFriendsScreen({ active, onVerticalScroll }: Props) {
  const insets = useSafeAreaInsets();
  const conversations = useChatStore((state) => state.conversations);
  const hydrateInbox = useChatStore((state) => state.hydrateInbox);
  const refreshing = useChatStore((state) => state.hydratingInbox);

  useFocusEffect(useCallback(() => {
    if (active) void hydrateInbox();
  }, [active, hydrateInbox]));

  const friends = useMemo(() => conversations.filter((conversation) =>
    (conversation.kind ?? 'friend') === 'friend'
      && !conversation.isArchived
      && !conversation.isHidden,
  ), [conversations]);

  const openProfile = useCallback((friend: Conversation) => {
    const handle = friend.peerHandle.replace(/^@/, '').trim();
    if (handle) router.push(`/creator/${encodeURIComponent(handle)}`);
  }, []);

  const renderFriend = useCallback(({ item }: { item: Conversation }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => openProfile(item)}
      accessibilityRole="button"
      accessibilityLabel={`ดูโปรไฟล์ ${item.peerName}`}
    >
      <Avatar
        uri={item.avatarUri}
        initial={item.peerName.slice(0, 1)}
        size={76}
        radius={38}
        borderWidth={2}
        borderColor="#FFFFFF"
      />
      <Text style={styles.name} numberOfLines={1}>{item.peerName}</Text>
      <Text style={styles.handle} numberOfLines={1}>{item.peerHandle}</Text>
      <Text style={styles.activity} numberOfLines={1}>อัปเดต {item.updatedAt}</Text>
      <Pressable
        style={styles.chatButton}
        onPress={(event) => {
          event.stopPropagation();
          router.push(`/(tabs)/chat/${encodeURIComponent(item.remoteId || item.id)}`);
        }}
        accessibilityRole="button"
        accessibilityLabel={`แชตกับ ${item.peerName}`}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={16} color="#FFFFFF" />
        <Text style={styles.chatButtonText}>แชต</Text>
      </Pressable>
    </Pressable>
  ), [openProfile]);

  return (
    <View style={styles.root}>
      <FlatList
        data={friends}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={renderFriend}
        scrollEnabled={active}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 58, paddingBottom: insets.bottom + 110 },
          friends.length === 0 && styles.emptyContent,
        ]}
        onScroll={(event) => onVerticalScroll?.(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void hydrateInbox()}
            tintColor="#202824"
          />
        )}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.title}>เพื่อน</Text>
            <Text style={styles.subtitle}>รายชื่อเพื่อนทั้งหมดของคุณ</Text>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={34} color="#7B8580" />
            </View>
            <Text style={styles.emptyTitle}>ยังไม่มีเพื่อนในรายการ</Text>
            <Text style={styles.emptyText}>เพิ่มเพื่อนหรือเริ่มแชตก่อน แล้วรายชื่อจะปรากฏที่นี่</Text>
            <Pressable style={styles.addButton} onPress={() => router.push('/(tabs)/chat/add-friend')}>
              <Ionicons name="person-add-outline" size={17} color="#FFFFFF" />
              <Text style={styles.addButtonText}>เพิ่มเพื่อน</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1F3F1' },
  content: { paddingHorizontal: 12 },
  emptyContent: { flexGrow: 1 },
  header: { marginBottom: 14 },
  title: { color: '#171D19', fontSize: 29, fontWeight: '900' },
  subtitle: { color: '#68726C', fontSize: 14, fontWeight: '700', marginTop: 2 },
  row: { gap: 10 },
  card: {
    flex: 1,
    minWidth: 0,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDE2DE',
  },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  name: { color: '#202824', fontSize: 15, fontWeight: '900', marginTop: 10, maxWidth: '100%' },
  handle: { color: '#7D8781', fontSize: 11, marginTop: 2, maxWidth: '100%' },
  activity: { color: '#9AA29E', fontSize: 10, marginTop: 7, maxWidth: '100%' },
  chatButton: {
    height: 36,
    marginTop: 12,
    paddingHorizontal: 17,
    borderRadius: 18,
    backgroundColor: '#202824',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chatButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, paddingBottom: 80 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E4E8E5', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#303833', fontSize: 18, fontWeight: '900', marginTop: 14 },
  emptyText: { color: '#7E8882', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  addButton: { height: 42, marginTop: 16, paddingHorizontal: 18, borderRadius: 21, backgroundColor: '#202824', flexDirection: 'row', alignItems: 'center', gap: 7 },
  addButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
