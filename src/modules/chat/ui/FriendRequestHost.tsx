import React, { useEffect } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useFriendRequestStore } from '@/modules/search/state/friend-request-store';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';

/** Mounted once above the navigator: requests arrive even while browsing the feed. */
export function FriendRequestHost() {
  const token = useAuthStore((s) => s.sessionToken);
  const userId = useAuthStore((s) => s.user?.id);
  const session = useFriendRequestStore((s) => s.session);
  const requests = useFriendRequestStore((s) => s.requests);
  const dismissed = useFriendRequestStore((s) => s.dismissed);
  const path = usePathname();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const store = useFriendRequestStore.getState();
    store.bind(userId && token ? token : null);
    if (!userId || !token) return;
    const refresh = () => { if (AppState.currentState !== 'background') void store.refresh(); };
    refresh();
    const timer = setInterval(refresh, 5000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); listener.remove(); store.bind(null); };
  }, [token, userId]);
  const incoming = requests.filter((r) => r.direction === 'incoming' && r.status === 'PENDING');
  const first = incoming.find((r) => !dismissed.includes(r.id));
  if (!userId || !token || session !== token || !first || path.includes('friend-requests') || path.includes('add-friend')) return null;
  const dismiss = () => useFriendRequestStore.getState().dismiss(first.id);
  return <View pointerEvents="box-none" style={[styles.position, { top: insets.top + 8 }]}>
    <DragDownDismiss key={first.id} onDismiss={dismiss} dismissDistance={50} style={styles.card}>
      <View style={styles.row}>
        <Pressable style={styles.body} onPress={() => router.push('/friend-requests')} accessibilityRole="button">
          <Text style={styles.title}>คำขอเป็นเพื่อน {incoming.length} รายการ</Text>
          <Text style={styles.text} numberOfLines={2}>{first.peer.displayName} ขอเป็นเพื่อนกับคุณ</Text>
          <Text style={styles.action}>ดูคำขอ / ยอมรับเป็นเพื่อน →</Text>
        </Pressable>
        <Pressable onPress={dismiss} hitSlop={12} accessibilityLabel="ปิดการแจ้งเตือน"><Text style={styles.text}>✕</Text></Pressable>
      </View>
    </DragDownDismiss>
  </View>;
}
const styles = StyleSheet.create({
  position: { position: 'absolute', left: 14, right: 14, zIndex: 1000, elevation: 20 },
  card: { backgroundColor: '#123226', borderRadius: 16, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1 },
  title: { color: '#D6F77A', fontWeight: '800', fontSize: 15 },
  text: { color: '#FFFFFF', marginTop: 4 },
  action: { color: '#D6F77A', marginTop: 8, fontWeight: '700' },
});
