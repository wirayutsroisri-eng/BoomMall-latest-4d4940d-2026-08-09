import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { SEARCH_DIRECTORY } from '@/modules/search/data/mockSearchDirectory';
import { colors } from '@/shared/theme/colors';

const FRAME_SIZE = 240;

function normalizeHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, '');
}

/**
 * QR Code Scanner — mock camera viewfinder (Simulator has no real camera, so this mirrors
 * the same "camera-look" mock pattern already used by CameraStudioScreen). Resolves a scan
 * against the friend directory and jumps straight into 1-on-1 Super Chat, LINE/WeChat-style.
 */
export function QrScanScreen() {
  const insets = useSafeAreaInsets();
  const conversations = useChatStore((s) => s.conversations);
  const addFriend = useChatStore((s) => s.addFriend);
  const [flash, setFlash] = useState(false);
  const [resolving, setResolving] = useState(false);
  const cycleRef = useRef(0);

  const scanY = useSharedValue(0);

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

  const handleScanned = (handle: string, displayName: string) => {
    if (resolving) return;
    setResolving(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const target = normalizeHandle(handle);
    const existing = conversations.find((c) => normalizeHandle(c.peerHandle) === target);
    const conversationId = existing?.id ?? addFriend(displayName, handle);

    setTimeout(() => {
      if (router.canDismiss()) router.dismiss();
      router.replace(`/(tabs)/chat/${conversationId}`);
    }, 220);
  };

  /** Simulator has no camera hardware — this cycles through the mock directory so the
   *  "successful scan → add friend → open chat" flow can be fully demoed on-device. */
  const simulateScan = () => {
    const candidates = SEARCH_DIRECTORY.filter(
      (r) => !conversations.some((c) => normalizeHandle(c.peerHandle) === r.handle),
    );
    const pool = candidates.length > 0 ? candidates : SEARCH_DIRECTORY;
    const target = pool[cycleRef.current % pool.length];
    cycleRef.current += 1;
    handleScanned(target.handle, target.displayName);
  };

  return (
    <View style={styles.root}>
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
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Animated.View style={[styles.scanLine, scanLineStyle]} />
        </View>
        <Text style={styles.hint}>จ่อกล้องไปที่ QR Code ของเพื่อนหรือร้านค้า</Text>
        <Text style={styles.hintSub}>เพิ่มเพื่อนและเริ่มแชตได้ทันทีที่สแกนสำเร็จ</Text>
      </View>

      <View style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Pressable
          style={[styles.simulateBtn, resolving && styles.simulateBtnBusy]}
          onPress={simulateScan}
          disabled={resolving}
        >
          <Ionicons name="scan" size={18} color={colors.brand.ink} />
          <Text style={styles.simulateBtnText}>
            {resolving ? 'กำลังเพิ่มเพื่อน...' : 'จำลองสแกนสำเร็จ (Simulator)'}
          </Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>หรือ</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable style={styles.manualBtn} onPress={() => router.back()}>
          <Ionicons name="at" size={16} color="#fff" />
          <Text style={styles.manualBtnText}>พิมพ์ชื่อผู้ใช้ / ไอดีแทน</Text>
        </Pressable>
      </View>
    </View>
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
