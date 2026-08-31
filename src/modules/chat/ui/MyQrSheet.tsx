import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import { createFriendInvite, getMyFriendIdentity } from '@/modules/search/data/friendApi';

type Props = {
  visible: boolean;
  displayName: string;
  handle: string;
  onClose: () => void;
};

/** Current-user QR card. Closable by drag-down or the X. */
export function MyQrSheet({ visible, displayName, handle, onClose }: Props) {
  const rawHandle = handle.replace(/^@/, '') || displayName || '';
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [inviteError, setInviteError] = useState(false);
  // ถ้ายังไม่มี username (fallback 'me') ให้ใช้รหัสเพื่อนที่จำง่ายแทน
  const isFallbackHandle = !rawHandle || rawHandle === 'me';
  const label = (isFallbackHandle && friendCode ? friendCode : rawHandle) || 'boommall';

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setDeepLink(null);
    setFriendCode('');
    setLoading(true);
    setInviteError(false);
    void Promise.all([createFriendInvite(), getMyFriendIdentity()])
      .then(([invite, me]) => {
        if (cancelled) return;
        setDeepLink(invite.deepLink);
        setFriendCode(me.friendCode);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setInviteError(true);
        Alert.alert('สร้าง QR Code ไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองใหม่');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="ปิด" />
          <DragDownDismiss onDismiss={onClose} style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text style={styles.title}>QR Code ของฉัน</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="ปิด">
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </Pressable>
            </View>
            <View style={styles.card}>
              <View style={styles.qrFrame}>
                {loading
                  ? <ActivityIndicator color={colors.brand.ink} />
                  : inviteError
                    ? <Ionicons name="alert-circle-outline" size={44} color={colors.text.muted} />
                    : deepLink
                      ? <QRCode value={deepLink} size={150} color={colors.brand.ink} backgroundColor="#FFFFFF" />
                      : null}
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {displayName || 'BoomMall'}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{label}
              </Text>
              {friendCode ? (
                <Text style={styles.friendCode} numberOfLines={1}>
                  รหัสเพื่อน: {friendCode}
                </Text>
              ) : null}
              <Text style={styles.hint}>ให้เพื่อนสแกน QR หรือพิมพ์รหัสเพื่อนเพื่อขอเป็นเพื่อน</Text>
            </View>
          </DragDownDismiss>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,20,15,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 36,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontWeight: '900',
    fontSize: 16,
    color: colors.text.primary,
  },
  card: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  qrFrame: {
    width: 188,
    height: 188,
    borderRadius: 20,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  name: {
    fontWeight: '900',
    fontSize: 17,
    color: colors.text.primary,
  },
  handle: {
    marginTop: 4,
    color: colors.text.secondary,
    fontWeight: '700',
    fontSize: 13,
  },
  friendCode: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: colors.brand.mist,
    color: colors.brand.ink,
    fontWeight: '800',
    fontSize: 13,
  },
  hint: {
    marginTop: 10,
    color: colors.text.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});
