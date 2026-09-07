import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFriendRequestStore } from '@/modules/search/state/friend-request-store';
import { router } from 'expo-router';
import { useFriendRequests } from '@/modules/search/data/useFriendRequests';
import { colors } from '@/shared/theme/colors';

export function FriendRequestsPanel({ active = true, showOutgoing = false }: { active?: boolean; showOutgoing?: boolean }) {
  const { requests, error, refresh } = useFriendRequests(active);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = requests.filter((r) =>
    (r.status === 'PENDING' && (showOutgoing || r.direction === 'incoming'))
    || (showOutgoing && r.status === 'ACCEPTED' && r.direction === 'incoming'),
  );
  const respond = async (id: string, action: 'accept' | 'reject') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await useFriendRequestStore.getState().respond(id, action);
      if (action === 'accept') {
        if (result.conversationId) {
          router.replace({ pathname: '/(tabs)/chat/[conversationId]', params: { conversationId: result.conversationId } });
        } else {
          Alert.alert('เป็นเพื่อนกันแล้ว', 'เปิดแชตได้จากรายการแชต', [{ text: 'เปิดแชต', onPress: () => router.replace('/(tabs)/chat') }]);
        }
      }
    } catch (e) { Alert.alert('ดำเนินการไม่สำเร็จ', e instanceof Error ? e.message : 'กรุณาลองใหม่'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!pending.length && !error && !showOutgoing) return null;
  return <View style={styles.panel}>
    <Text style={styles.title}>คำขอเป็นเพื่อน</Text>
    {error ? <Pressable onPress={() => void refresh()}><Text style={styles.hint}>{error} · แตะเพื่อลองใหม่</Text></Pressable> : null}
    {!pending.length && !error ? <Text style={styles.hint}>ยังไม่มีคำขอใหม่ · อัปเดตอัตโนมัติ</Text> : null}
    {pending.map((r) => <View key={r.id} style={styles.row}>
      <View style={styles.peer}><Text style={styles.title}>{r.peer.displayName}</Text><Text style={styles.hint}>{r.peer.handle ? `@${r.peer.handle}` : r.peer.friendCode}</Text></View>
      {r.status === 'ACCEPTED' ? <Pressable disabled={busy} style={[styles.button, styles.accept]} onPress={() => void respond(r.id, 'accept')}><Text>เปิดแชต</Text></Pressable> : r.direction === 'outgoing' ? <Text style={styles.hint}>รอตอบรับ</Text> : <>
        <Pressable disabled={busy} style={styles.button} onPress={() => void respond(r.id, 'reject')}><Text>ปฏิเสธ</Text></Pressable>
        <Pressable disabled={busy} style={[styles.button, styles.accept]} onPress={() => void respond(r.id, 'accept')}><Text>ยอมรับ</Text></Pressable>
      </>}
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  panel: { padding: 12, gap: 10 },
  title: { fontWeight: '800', color: colors.text.primary },
  hint: { fontSize: 12, color: colors.text.secondary },
  peer: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  button: { padding: 10, borderRadius: 10, backgroundColor: colors.surface.card },
  accept: { backgroundColor: colors.brand.primary },
});
