import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '@/shared/theme/colors';
import { createFriendInvite, getMyFriendIdentity, resolveFriendInvite, searchFriendProfiles, sendFriendRequest, type FriendProfile } from '@/modules/search/data/friendApi';
import { FriendRequestsPanel } from './FriendRequestsPanel';
import { Avatar } from '@/shared/components/Avatar';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';

/** Search for a real profile, confirm the recipient, and track friend requests. */
export function AddFriendScreen() {
  const insets = useSafeAreaInsets();
  const [handle, setHandle] = useState('');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [searched, setSearched] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const { token } = useLocalSearchParams<{ token?: string }>();

  useEffect(() => {
    let active = true;
    setQrError(null);
    void getMyFriendIdentity().then((me) => { if (active) setFriendCode(me.friendCode); })
      .catch((e) => { if (active) setQrError(e instanceof Error ? e.message : 'โหลดรหัสเพื่อนไม่สำเร็จ'); });
    void createFriendInvite().then((invite) => { if (active) setDeepLink(invite.deepLink); })
      .catch((e) => { if (active) setQrError(e instanceof Error ? e.message : 'สร้าง QR ไม่สำเร็จ'); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void resolveFriendInvite(token).then((profile) => {
      if (active) { setResults([profile]); setSearched(true); }
    }).catch((e) => { if (active) Alert.alert('QR ใช้งานไม่ได้', e instanceof Error ? e.message : 'กรุณาลองใหม่'); });
    return () => { active = false; };
  }, [token]);

  const submit = async () => {
    if (lock.current) return;
    if (handle.trim().replace(/^@/, '').length < 3) {
      Alert.alert('กรอกชื่อผู้ใช้หรือรหัสเพื่อน', 'กรุณากรอกอย่างน้อย 3 ตัวอักษร');
      return;
    }
    lock.current = true;
    setBusy(true);
    setResults([]);
    setSearched(false);
    try {
      setResults(await searchFriendProfiles(handle.trim()));
      setSearched(true);
    } catch (e) { Alert.alert('ค้นหาไม่สำเร็จ', e instanceof Error ? e.message : 'กรุณาลองใหม่'); }
    finally { lock.current = false; setBusy(false); }
  };

  const send = async (profile: FriendProfile) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await sendFriendRequest(profile.userId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(result.status === 'ACCEPTED' ? 'เป็นเพื่อนกันแล้ว' : 'ส่งคำขอแล้ว', result.status === 'ACCEPTED' ? 'เปิดแชตได้จากรายการแชต' : 'ให้อีกฝ่ายกดยอมรับในหน้าเพื่อน แชต หรือเพิ่มเพื่อน');
      setResults((rows) => rows.filter((row) => row.userId !== profile.userId));
      setSearched(false);
    } catch (e) { Alert.alert('เพิ่มเพื่อนไม่สำเร็จ', e instanceof Error ? e.message : 'กรุณาลองใหม่'); }
    finally { lock.current = false; setBusy(false); }
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
          {deepLink ? <QRCode value={deepLink} size={150} color={colors.brand.ink} backgroundColor="#FFFFFF" quietZone={12} /> : <Ionicons name={qrError ? "alert-circle-outline" : "hourglass"} size={36} color={colors.text.muted} />}
        </View>
        <Text style={styles.qrLabel}>QR Code ของฉัน</Text>
        <Text style={styles.qrHint}>{friendCode || (qrError ? 'โหลดรหัสไม่สำเร็จ' : 'กำลังสร้างรหัส…')} · QR หมดอายุใน 24 ชั่วโมง</Text>
      </View>

      {qrError ? <Pressable onPress={() => setReload((n) => n + 1)}><Text style={styles.qrHint}>{qrError} · แตะเพื่อลองใหม่</Text></Pressable> : null}

      <FriendRequestsPanel showOutgoing />
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

      <Text style={styles.inputLabel}>ค้นหาด้วยชื่อผู้ใช้ รหัสเพื่อน หรือ ID</Text>
      <View style={styles.inputRow}>
        <Ionicons name="at" size={18} color={colors.text.muted} />
        <TextInput
          style={styles.input}
          placeholder="@username, รหัสเพื่อน หรือ ID"
          placeholderTextColor={colors.text.muted}
          value={handle}
          editable={!busy}
          onChangeText={(value) => { setHandle(value); setResults([]); setSearched(false); }}
          onSubmitEditing={() => void submit()}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Pressable style={styles.addBtn} onPress={() => void submit()} disabled={busy}>
        <Text style={styles.addBtnText}>{busy ? 'กำลังดำเนินการ…' : 'ค้นหาเพื่อน'}</Text>
      </Pressable>
      {searched && !results.length ? <Text style={styles.qrHint}>ไม่พบผู้ใช้ที่ตรงกับคำค้นหา</Text> : null}
      {results.map((profile) => <View key={profile.userId} style={styles.requestRow}>
        <Avatar uri={profile.avatarUrl ?? undefined} initial={profile.displayName.slice(0, 1)} size={44} />
        <View style={{ flex: 1 }}><Text style={styles.requestName}>{profile.displayName}</Text><Text style={styles.qrHint}>{profile.handle ? `@${profile.handle}` : profile.friendCode}</Text></View>
        <Pressable disabled={busy} style={styles.acceptBtn} onPress={() => void send(profile)}><Text style={styles.acceptText}>เพิ่มเพื่อน</Text></Pressable>
      </View>)}
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
