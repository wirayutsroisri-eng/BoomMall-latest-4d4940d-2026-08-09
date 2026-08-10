import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { colors } from '@/shared/theme/colors';

/** เพิ่มเพื่อน / สแกน QR Code — LINE-style Add Friend flow with a QR placeholder + manual handle entry. */
export function AddFriendScreen() {
  const insets = useSafeAreaInsets();
  const addFriend = useChatStore((s) => s.addFriend);
  const [handle, setHandle] = useState('');

  const submit = () => {
    const trimmed = handle.trim();
    if (!trimmed) {
      Alert.alert('กรอกชื่อผู้ใช้หรือรหัสเพื่อน', 'พิมพ์ @handle ของเพื่อนที่ต้องการเพิ่ม');
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = addFriend(trimmed.replace(/^@/, ''), trimmed);
    router.replace(`/(tabs)/chat/${id}`);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.title}>เพิ่มเพื่อน</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.qrCard}>
        <View style={styles.qrFrame}>
          <Ionicons name="qr-code" size={140} color={colors.brand.ink} />
        </View>
        <Text style={styles.qrLabel}>QR Code ของฉัน</Text>
        <Text style={styles.qrHint}>ให้เพื่อนสแกนโค้ดนี้เพื่อเพิ่มเป็นเพื่อนทันที</Text>
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

      <Pressable style={styles.addBtn} onPress={submit}>
        <Text style={styles.addBtnText}>เพิ่มเพื่อน</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
    paddingHorizontal: 20,
  },
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
});
