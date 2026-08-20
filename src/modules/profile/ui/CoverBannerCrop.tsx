import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image as RNImage,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import { PROFILE_COVER_HEIGHT, profileCoverFrameWidth } from '../domain/profile-cover';

type Props = {
  uri: string;
  onCancel: () => void;
  onSave: (uri: string) => void;
};

const SCREEN_W = Dimensions.get('window').width;
const CROP_W = profileCoverFrameWidth(SCREEN_W);
const CROP_H = PROFILE_COVER_HEIGHT;
const STAGE_W = SCREEN_W;
const STAGE_H = CROP_H + 120;
const FRAME_TOP = (STAGE_H - CROP_H) / 2;
const MAX_SCALE = 4;
const PREVIEW_MAX = 2048;
const OUTPUT_WIDTH = 1600;

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

function measureImage(uri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(
      uri,
      (w, h) => resolve({ w: Math.max(1, w), h: Math.max(1, h) }),
      () => reject(new Error('measure')),
    );
  });
}

async function decodeToJpeg(sourceUri: string): Promise<{ uri: string; w: number; h: number }> {
  let srcW = 0;
  let srcH = 0;
  try {
    const measured = await measureImage(sourceUri);
    srcW = measured.w;
    srcH = measured.h;
  } catch {
    // manipulator still runs
  }
  const ctx = ImageManipulator.manipulate(sourceUri);
  const targetW = srcW > 0 ? Math.min(srcW, PREVIEW_MAX) : PREVIEW_MAX;
  ctx.resize({ width: targetW });
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  let w = Math.max(rendered.width || 0, 0);
  let h = Math.max(rendered.height || 0, 0);
  try {
    const measured = await measureImage(saved.uri);
    w = Math.max(w, measured.w);
    h = Math.max(h, measured.h);
  } catch {
    if (srcW > 0 && srcH > 0) {
      const scale = targetW / srcW;
      w = Math.max(w, Math.round(srcW * scale));
      h = Math.max(h, Math.round(srcH * scale));
    }
  }
  if (w < 8 || h < 8) {
    throw new Error('tiny');
  }
  return { uri: saved.uri, w, h };
}

/** Fixed banner frame — pan / pinch to choose focus, like profile avatar crop. */
export function CoverBannerCrop({ uri: sourceUri, onCancel, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: CROP_W, h: CROP_H });
  const [ready, setReady] = useState(false);
  const [painted, setPainted] = useState(false);
  const [busy, setBusy] = useState(false);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const pinchStart = useSharedValue(1);
  const panStart = useSharedValue({ x: 0, y: 0 });
  const natW = useSharedValue(1);
  const natH = useSharedValue(1);
  const cover = useSharedValue(1);

  const applyFrame = (nextUri: string, width: number, height: number) => {
    const nextCover = Math.max(CROP_W / width, CROP_H / height);
    natW.value = width;
    natH.value = height;
    cover.value = nextCover;
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    setNatural({ w: width, h: height });
    setPainted(false);
    setUri(nextUri);
    setReady(true);
  };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setPainted(false);
    setUri(null);
    void (async () => {
      try {
        const decoded = await decodeToJpeg(sourceUri);
        if (cancelled) return;
        applyFrame(decoded.uri, decoded.w, decoded.h);
      } catch {
        if (cancelled) return;
        Alert.alert('เปิดรูปไม่ได้', 'เลือกรูปอื่นแล้วลองอีกครั้ง');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceUri]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      pinchStart.value = scale.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = clamp(pinchStart.value * e.scale, 1, MAX_SCALE);
      scale.value = next;
      const dispW = natW.value * cover.value * next;
      const dispH = natH.value * cover.value * next;
      const maxX = Math.max(0, (dispW - CROP_W) / 2);
      const maxY = Math.max(0, (dispH - CROP_H) / 2);
      tx.value = clamp(tx.value, -maxX, maxX);
      ty.value = clamp(ty.value, -maxY, maxY);
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .averageTouches(true)
    .blocksExternalGesture()
    .onStart(() => {
      'worklet';
      panStart.value = { x: tx.value, y: ty.value };
    })
    .onUpdate((e) => {
      'worklet';
      const dispW = natW.value * cover.value * scale.value;
      const dispH = natH.value * cover.value * scale.value;
      const maxX = Math.max(0, (dispW - CROP_W) / 2);
      const maxY = Math.max(0, (dispH - CROP_H) / 2);
      tx.value = clamp(panStart.value.x + e.translationX, -maxX, maxX);
      ty.value = clamp(panStart.value.y + e.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      'worklet';
      const dispW = natW.value * cover.value * scale.value;
      const dispH = natH.value * cover.value * scale.value;
      const maxX = Math.max(0, (dispW - CROP_W) / 2);
      const maxY = Math.max(0, (dispH - CROP_H) / 2);
      tx.value = withSpring(clamp(tx.value, -maxX, maxX), { damping: 22, stiffness: 220 });
      ty.value = withSpring(clamp(ty.value, -maxY, maxY), { damping: 22, stiffness: 220 });
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const imageBoxStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const displayW = natural.w * Math.max(CROP_W / natural.w, CROP_H / natural.h);
  const displayH = natural.h * Math.max(CROP_W / natural.w, CROP_H / natural.h);

  const rotate90 = async () => {
    if (busy || !uri) return;
    setBusy(true);
    try {
      const ctx = ImageManipulator.manipulate(uri);
      ctx.rotate(90);
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
      let width = Math.max(1, rendered.width || natural.h);
      let height = Math.max(1, rendered.height || natural.w);
      try {
        const measured = await measureImage(saved.uri);
        width = measured.w;
        height = measured.h;
      } catch {
        // keep swapped fallback from the previous frame
      }
      applyFrame(saved.uri, width, height);
      void Haptics.selectionAsync();
    } catch {
      Alert.alert('หมุนรูปไม่ได้', 'ลองอีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy || !ready || !uri) return;
    setBusy(true);
    try {
      const s = scale.value;
      const x = tx.value;
      const y = ty.value;
      const coverScale = cover.value;
      const dispW = natural.w * coverScale * s;
      const dispH = natural.h * coverScale * s;
      const imgLeft = STAGE_W / 2 - dispW / 2 + x;
      const imgTop = STAGE_H / 2 - dispH / 2 + y;
      const frameLeft = 0;
      const frameTop = FRAME_TOP;
      let originX = ((frameLeft - imgLeft) / dispW) * natural.w;
      let originY = ((frameTop - imgTop) / dispH) * natural.h;
      let cropW = (CROP_W / dispW) * natural.w;
      let cropH = (CROP_H / dispH) * natural.h;
      originX = clamp(originX, 0, Math.max(0, natural.w - 2));
      originY = clamp(originY, 0, Math.max(0, natural.h - 2));
      cropW = clamp(cropW, 2, natural.w - originX);
      cropH = clamp(cropH, 2, natural.h - originY);
      const ctx = ImageManipulator.manipulate(uri);
      ctx.crop({
        originX: Math.round(originX),
        originY: Math.round(originY),
        width: Math.round(cropW),
        height: Math.round(cropH),
      });
      ctx.resize({ width: OUTPUT_WIDTH });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(saved.uri);
    } catch {
      Alert.alert('บันทึกไม่สำเร็จ', 'ลองจัดภาพแล้วกดบันทึกอีกครั้ง');
      setBusy(false);
    }
  };

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <DragDownDismiss onDismiss={onCancel} rootInModal style={styles.sheet}>
          <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
            <Text style={styles.title}>จัดรูปปก</Text>
            <Text style={styles.subtitle}>เลื่อนและซูมเพื่อเลือกส่วนที่ต้องการ</Text>
          </View>

          <View style={styles.stage}>
            <GestureDetector gesture={composed}>
              <Animated.View style={styles.stageInner}>
                {ready && uri ? (
                  <Animated.View style={[imageBoxStyle, { opacity: painted ? 1 : 0 }]}>
                    <RNImage
                      key={uri}
                      source={{ uri }}
                      style={{ width: displayW, height: displayH }}
                      resizeMode="stretch"
                      onLoad={() => setPainted(true)}
                      onLoadEnd={() => setPainted(true)}
                    />
                  </Animated.View>
                ) : null}
                {!ready || !painted ? (
                  <ActivityIndicator color={colors.brand.primaryDark} />
                ) : null}
              </Animated.View>
            </GestureDetector>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width={STAGE_W} height={STAGE_H}>
                <Defs>
                  <Mask id="cover-hole">
                    <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill="#fff" />
                    <Rect x={0} y={FRAME_TOP} width={CROP_W} height={CROP_H} fill="#000" />
                  </Mask>
                </Defs>
                <Rect
                  x={0}
                  y={0}
                  width={STAGE_W}
                  height={STAGE_H}
                  fill="rgba(255,255,255,0.78)"
                  mask="url(#cover-hole)"
                />
                <Rect
                  x={0}
                  y={FRAME_TOP}
                  width={CROP_W}
                  height={CROP_H}
                  fill="none"
                  stroke="rgba(0,0,0,0.12)"
                  strokeWidth={1}
                />
              </Svg>
            </View>
            <Pressable
              style={[styles.rotateBtn, { top: FRAME_TOP + CROP_H + 8 }]}
              onPress={() => void rotate90()}
              hitSlop={8}
              accessibilityLabel="หมุนรูป"
            >
              <Ionicons name="refresh-outline" size={20} color="#111" />
            </Pressable>
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={() => void save()} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>บันทึก</Text>
              )}
            </Pressable>
          </View>
        </DragDownDismiss>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#fff',
  },
  sheet: { flex: 1, backgroundColor: '#fff' },
  header: {
    alignItems: 'center',
    paddingBottom: 10,
    paddingHorizontal: 20,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.muted,
    textAlign: 'center',
  },
  stage: {
    width: STAGE_W,
    height: STAGE_H,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  stageInner: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotateBtn: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E8EDEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  saveBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
