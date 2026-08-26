import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';
import { resolveFriendInvite, sendFriendRequest } from '@/modules/search/data/friendApi';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';

const FRAME_SIZE = 240;

/**
 * QR friend scanner backed by a revocable server-side invite token.
 */
export function QrScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState(false);
  const [resolving, setResolving] = useState(false);

  const scanY = useSharedValue(0);

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    scanY.value = withRepeat(
      withSequence(
        withTiming(FRAME_SIZE - 3, { duration: 1400 }),
        withTiming(0, { duration: 1400 }),
      ),
      -1,
      false,
    );
  }, [scanY]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value }],
  }));

  const handleScanned = (result: BarcodeScanningResult) => {
    if (resolving) return;
    const match = result.data.match(/[?&]token=([^&]+)/);
    const token = match?.[1] ? decodeURIComponent(match[1]) : '';
    if (!token) {
      Alert.alert('QR ไม่ถูกต้อง', 'QR นี้ไม่ใช่ลิงก์เพิ่มเพื่อนของ BoomMall');
      return;
    }
    setResolving(true);
    void resolveFriendInvite(token).then((profile) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        `เพิ่ม ${profile.displayName} เป็นเพื่อน?`,
        `@${profile.handle ?? profile.friendCode} · ${profile.friendCode}`,
        [
          { text: 'ยกเลิก', style: 'cancel', onPress: () => setResolving(false) },
          {
            text: 'ส่งคำขอ',
            onPress: () => void sendFriendRequest(profile.userId).then(() => {
              Alert.alert('ส่งคำขอแล้ว', 'รออีกฝ่ายตอบรับก่อนเริ่มแชต');
              router.back();
            }).catch((error: unknown) => {
              setResolving(false);
              Alert.alert('ส่งคำขอไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองใหม่');
            }),
          },
        ],
      );
    }).catch((error: unknown) => {
      setResolving(false);
      Alert.alert('QR ใช้งานไม่ได้', error instanceof Error ? error.message : 'QR อาจหมดอายุแล้ว');
    });
  };

  const goAddFriend = () => {
    if (router.canDismiss()) router.dismiss();
    router.push('/(tabs)/chat/add-friend');
  };

  return (
    <DragDownDismiss onDismiss={() => router.back()} style={styles.root}>
      <LinearGradient colors={['#141414', '#000000']} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.title}>สแกน QR Code</Text>
        <Pressable style={styles.iconBtn} onPress={() => setFlash((f) => !f)} hitSlop={8}>
          <Ionicons name={flash ? 'flash' : 'flash-off'} size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.center}>
        <View style={styles.frame}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={flash}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={resolving ? undefined : handleScanned}
            />
          ) : null}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Animated.View style={[styles.scanLine, scanLineStyle]} />
        </View>
        <Text style={styles.hint}>จ่อกล้องไปที่ QR Code ของเพื่อนหรือร้านค้า</Text>
        <Text style={styles.hintSub}>
          ระบบจะแสดงโปรไฟล์ให้ยืนยันก่อนส่งคำขอทุกครั้ง
        </Text>
      </View>

      <View style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {!permission?.granted ? (
          <Pressable style={styles.simulateBtn} onPress={goAddFriend}>
            <Ionicons name="person-add" size={18} color={colors.brand.ink} />
            <Text style={styles.simulateBtnText}>อนุญาตกล้อง หรือเพิ่มด้วยรหัสแทน</Text>
          </Pressable>
        ) : null}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>หรือ</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable style={styles.manualBtn} onPress={goAddFriend}>
          <Ionicons name="at" size={16} color="#fff" />
          <Text style={styles.manualBtnText}>พิมพ์ชื่อผู้ใช้ / ไอดีแทน</Text>
        </Pressable>
      </View>
    </DragDownDismiss>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: colors.brand.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  scanLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brand.primary,
    shadowColor: colors.brand.primary,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  hint: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  hintSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -10,
  },
  bottomPanel: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  simulateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand.primary,
    borderRadius: 16,
    paddingVertical: 14,
  },
  simulateBtnBusy: {
    opacity: 0.7,
  },
  simulateBtnText: {
    color: colors.brand.ink,
    fontWeight: '900',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dividerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 16,
    paddingVertical: 13,
  },
  manualBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
});
