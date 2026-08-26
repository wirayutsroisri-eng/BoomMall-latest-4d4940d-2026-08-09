import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '@/shared/theme/colors';
import { createFriendInvite, getMyFriendIdentity, listFriendRequests, respondFriendRequest, searchFriendProfiles, sendFriendRequest, type FriendRequestRow } from '@/modules/search/data/friendApi';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';

/** เพิ่มเพื่อน / สแกน QR Code — LINE-style Add Friend flow with a QR placeholder + manual handle entry. */
export function AddFriendScreen() {
  const insets = useSafeAreaInsets();
  const [handle, setHandle] = useState('');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [incoming, setIncoming] = useState<FriendRequestRow[]>([]);

  useEffect(() => {
    void Promise.all([getMyFriendIdentity(), createFriendInvite(), listFriendRequests()]).then(([me, invite, requests]) => {
      setFriendCode(me.friendCode);
      setDeepLink(invite.deepLink);
      setIncoming(requests.filter((row) => row.direction === 'incoming' && row.status === 'PENDING'));
    }).catch(() => undefined);
  }, []);

  const respond = async (id: string, action: 'accept' | 'reject') => {
    try {
      await respondFriendRequest(id, action);
      setIncoming((rows) => rows.filter((row) => row.id !== id));
      Alert.alert(action === 'accept' ? 'เป็นเพื่อนกันแล้ว' : 'ปฏิเสธคำขอแล้ว', action === 'accept' ? 'Direct Chat พร้อมใช้งานในหน้าแชต' : undefined);
    } catch (error) {
      Alert.alert('ดำเนินการไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองใหม่');
    }
  };

  const submit = async () => {
    const trimmed = handle.trim();
    if (!trimmed) {
      Alert.alert('กรอกชื่อผู้ใช้หรือรหัสเพื่อน', 'พิมพ์ @handle ของเพื่อนที่ต้องการเพิ่ม');
      return;
    }
    setBusy(true);
    try {
      const rows = await searchFriendProfiles(trimmed);
      const normalized = trimmed.replace(/^@/, '').toUpperCase();
      const target = rows.find((row) => row.friendCode === normalized || row.handle?.toLowerCase() === normalized.toLowerCase()) ?? rows[0];
      if (!target) throw new Error('ไม่พบผู้ใช้นี้');
      await sendFriendRequest(target.userId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('ส่งคำขอแล้ว', 'เมื่ออีกฝ่ายตอบรับ ระบบจะเปิด Direct Chat ให้โดยอัตโนมัติ');
      setHandle('');
    } catch (error) {
      Alert.alert('เพิ่มเพื่อนไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองใหม่');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DragDownDismiss onDismiss={() => router.back()} style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.title}>เพิ่มเพื่อน</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.qrCard}>
        <View style={styles.qrFrame}>
          {deepLink ? <QRCode value={deepLink} size={150} color={colors.brand.ink} backgroundColor="#FFFFFF" /> : <Ionicons name="hourglass" size={36} color={colors.text.muted} />}
        </View>
        <Text style={styles.qrLabel}>QR Code ของฉัน</Text>
        <Text style={styles.qrHint}>{friendCode || 'กำลังสร้างรหัส…'} · QR หมดอายุใน 24 ชั่วโมง</Text>
      </View>

      <Pressable
        style={styles.scanBtn}
        onPress={() => router.push('/qr-scan')}
      >
        <Ionicons name="scan" size={18} color={colors.brand.ink} />
        <Text style={styles.scanBtnText}>สแกน QR Code ของเพื่อน</Text>
      </Pressable>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>หรือ</Text>
        <View style={styles.dividerLine} />
      </View>

      <Text style={styles.inputLabel}>เพิ่มเพื่อนด้วยชื่อผู้ใช้</Text>
      <View style={styles.inputRow}>
        <Ionicons name="at" size={18} color={colors.text.muted} />
        <TextInput
          style={styles.input}
          placeholder="handle เช่น boomev_partner"
          placeholderTextColor={colors.text.muted}
          value={handle}
          onChangeText={setHandle}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Pressable style={styles.addBtn} onPress={() => void submit()} disabled={busy}>
        <Text style={styles.addBtnText}>{busy ? 'กำลังส่ง…' : 'ส่งคำขอเป็นเพื่อน'}</Text>
      </Pressable>
      {incoming.length ? <View style={styles.requests}>
        <Text style={styles.inputLabel}>คำขอเป็นเพื่อน</Text>
        {incoming.map((row) => <View key={row.id} style={styles.requestRow}>
          <View style={{ flex: 1 }}><Text style={styles.requestName}>{row.peer.displayName}</Text><Text style={styles.qrHint}>@{row.peer.handle ?? row.peer.friendCode}</Text></View>
          <Pressable style={styles.rejectBtn} onPress={() => void respond(row.id, 'reject')}><Text>ปฏิเสธ</Text></Pressable>
          <Pressable style={styles.acceptBtn} onPress={() => void respond(row.id, 'accept')}><Text style={styles.acceptText}>ยอมรับ</Text></Pressable>
        </View>)}
      </View> : null}
      </ScrollView>
    </DragDownDismiss>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text.primary,
  },
  qrCard: {
    alignItems: 'center',
    backgroundColor: colors.surface.card,
    borderRadius: 24,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  qrFrame: {
    width: 180,
    height: 180,
    borderRadius: 20,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  qrLabel: {
    fontWeight: '900',
    fontSize: 15,
    color: colors.text.primary,
  },
  qrHint: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand.primary,
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 20,
  },
  scanBtnText: {
    color: colors.brand.ink,
    fontWeight: '900',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.strong,
  },
  dividerText: {
    color: colors.text.muted,
    fontSize: 12,
  },
  inputLabel: {
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  input: {
    flex: 1,
    height: 48,
    color: colors.text.primary,
  },
  addBtn: {
    backgroundColor: colors.brand.ink,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  addBtnText: {
    color: colors.brand.primary,
    fontWeight: '900',
    fontSize: 15,
  },
  requests: { marginTop: 28, gap: 10 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.surface.card },
  requestName: { fontWeight: '800', color: colors.text.primary },
  rejectBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface.canvas },
  acceptBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.brand.primary },
  acceptText: { fontWeight: '800', color: colors.brand.ink },
});
