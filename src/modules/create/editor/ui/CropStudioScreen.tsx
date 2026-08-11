import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';
import {
  aspectValue,
  centeredCrop,
  clampCrop,
  cropToImagePixels,
  type AspectPreset,
  type CropRect,
} from '../domain/cropMath';

const RATIOS: Array<{
  key: AspectPreset;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'original', label: 'ต้นฉบับ', icon: 'image-outline' },
  { key: 'free', label: 'รูปแบบอิสระ', icon: 'scan-outline' },
  { key: '3:4', label: '3:4', icon: 'phone-portrait-outline' },
  { key: '9:16', label: '9:16', icon: 'tablet-portrait-outline' },
  { key: '1:1', label: '1:1', icon: 'square-outline' },
  { key: '4:3', label: '4:3', icon: 'tablet-landscape-outline' },
];

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

/**
 * TikTok-style crop studio — กรอบลากได้ · อัตราส่วน · พลิก · หมุน · ยกเลิก/บันทึก
 */
export function CropStudioScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{ uri?: string }>();
  const sourceUri = typeof params.uri === 'string' ? params.uri : null;

  const [uri, setUri] = useState(sourceUri);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [aspect, setAspect] = useState<AspectPreset>('free');
  const [crop, setCrop] = useState<CropRect>({ x: 40, y: 80, width: 200, height: 280 });
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const stageW = winW;
  const stageH = Math.min(winH * 0.55, winW * 1.35);

  const imageRatio = natural.w / Math.max(1, natural.h);
  const ratio = aspectValue(aspect, imageRatio);

  useEffect(() => {
    if (!uri) return;
    setReady(false);
    Image.getSize(
      uri,
      (w, h) => {
        setNatural({ w, h });
        const next = centeredCrop(stageW, stageH, aspectValue(aspect, w / h));
        setCrop(next);
        setReady(true);
      },
      () => {
        setNatural({ w: 1080, h: 1920 });
        setCrop(centeredCrop(stageW, stageH, aspectValue(aspect, 9 / 16)));
        setReady(true);
      },
    );
  }, [uri, stageW, stageH]);

  const applyAspect = (preset: AspectPreset) => {
    void Haptics.selectionAsync();
    setAspect(preset);
    const r = aspectValue(preset, imageRatio);
    setCrop(centeredCrop(stageW, stageH, r));
  };

  const runFlipOrRotate = async (op: 'flip' | 'rotate') => {
    if (!uri || busy) return;
    setBusy(true);
    try {
      const ctx = ImageManipulator.manipulate(uri);
      if (op === 'flip') ctx.flip(FlipType.Horizontal);
      else ctx.rotate(90);
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
      setUri(saved.uri);
      setAspect('free');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('แก้ไขไม่สำเร็จ', 'ลองอีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  const saveCrop = async () => {
    if (!uri || busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const px = cropToImagePixels(crop, stageW, stageH, natural.w, natural.h);
      const ctx = ImageManipulator.manipulate(uri);
      ctx.crop({
        originX: px.x,
        originY: px.y,
        width: px.width,
        height: px.height,
      });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
      router.replace({
        pathname: '/create-preview',
        params: { uri: saved.uri, type: 'image' },
      });
    } catch {
      Alert.alert('บันทึกไม่สำเร็จ', 'ลองอีกครั้ง');
      setBusy(false);
    }
  };

  const commitCrop = useCallback(
    (next: CropRect) => {
      let c = clampCrop(next, stageW, stageH);
      if (ratio != null) {
        // ล็อกอัตราส่วนหลังลากมุม
        const fromW = c.width;
        let height = fromW / ratio;
        if (height > stageH) {
          height = stageH;
          c.width = height * ratio;
        }
        c.height = height;
        c = clampCrop(c, stageW, stageH);
      }
      setCrop(c);
    },
    [stageW, stageH, ratio],
  );

  if (!uri) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.missing}>ไม่พบรูป</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>กลับ</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top tools — กระจก / หมุน แบบในภาพ */}
      <View style={styles.topTools}>
        <Pressable style={styles.topBtn} onPress={() => void runFlipOrRotate('flip')} disabled={busy}>
          <Ionicons name="swap-horizontal-outline" size={22} color="#fff" />
        </Pressable>
        <Pressable style={styles.topBtn} onPress={() => void runFlipOrRotate('rotate')} disabled={busy}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.stage, { width: stageW, height: stageH }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        {ready ? (
          <CropOverlay
            crop={crop}
            stageW={stageW}
            stageH={stageH}
            ratio={ratio}
            onCommit={commitCrop}
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        {busy ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
      </View>

      {/* Aspect presets */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.ratioRow}
        style={styles.ratioScroll}
      >
        {RATIOS.map((r) => {
          const active = aspect === r.key;
          return (
            <Pressable
              key={r.key}
              style={[styles.ratioItem, active && styles.ratioItemActive]}
              onPress={() => applyAspect(r.key)}
            >
              <View style={[styles.ratioIconBox, active && styles.ratioIconBoxActive]}>
                <Ionicons name={r.icon} size={22} color={active ? '#fff' : 'rgba(255,255,255,0.75)'} />
              </View>
              <Text style={[styles.ratioLabel, active && styles.ratioLabelActive]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.footerBtn}>ยกเลิก</Text>
        </Pressable>
        <Pressable onPress={() => void saveCrop()} hitSlop={10} disabled={busy}>
          <Text style={[styles.footerBtn, styles.footerSave]}>บันทึก</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CropOverlay({
  crop,
  stageW,
  stageH,
  ratio,
  onCommit,
}: {
  crop: CropRect;
  stageW: number;
  stageH: number;
  ratio: number | null;
  onCommit: (c: CropRect) => void;
}) {
  const x = useSharedValue(crop.x);
  const y = useSharedValue(crop.y);
  const w = useSharedValue(crop.width);
  const h = useSharedValue(crop.height);
  const start = useSharedValue({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    x.value = crop.x;
    y.value = crop.y;
    w.value = crop.width;
    h.value = crop.height;
  }, [crop.x, crop.y, crop.width, crop.height, x, y, w, h]);

  const emit = () => {
    onCommit({ x: x.value, y: y.value, width: w.value, height: h.value });
  };

  const makeHandle = (kind: Handle) =>
    Gesture.Pan()
      .onStart(() => {
        start.value = { x: x.value, y: y.value, w: w.value, h: h.value };
      })
      .onUpdate((e) => {
        const s = start.value;
        const min = 64;
        let nx = s.x;
        let ny = s.y;
        let nw = s.w;
        let nh = s.h;

        if (kind === 'move') {
          nx = s.x + e.translationX;
          ny = s.y + e.translationY;
        }
        if (kind === 'e' || kind === 'ne' || kind === 'se') {
          nw = s.w + e.translationX;
        }
        if (kind === 'w' || kind === 'nw' || kind === 'sw') {
          nx = s.x + e.translationX;
          nw = s.w - e.translationX;
        }
        if (kind === 's' || kind === 'se' || kind === 'sw') {
          nh = s.h + e.translationY;
        }
        if (kind === 'n' || kind === 'ne' || kind === 'nw') {
          ny = s.y + e.translationY;
          nh = s.h - e.translationY;
        }

        if (ratio != null && kind !== 'move') {
          if (kind === 'e' || kind === 'w') {
            nh = nw / ratio;
            ny = s.y + (s.h - nh) / 2;
          } else if (kind === 'n' || kind === 's') {
            nw = nh * ratio;
            nx = s.x + (s.w - nw) / 2;
          } else {
            // corners: ใช้ความกว้างเป็นหลัก
            nh = nw / ratio;
            if (kind === 'nw' || kind === 'ne') {
              ny = s.y + s.h - nh;
            }
            if (kind === 'nw' || kind === 'sw') {
              nx = s.x + s.w - nw;
            }
          }
        }

        if (nw < min) {
          if (kind.includes('w') || kind === 'w') nx = s.x + s.w - min;
          nw = min;
          if (ratio != null) nh = nw / ratio;
        }
        if (nh < min) {
          if (kind.includes('n') || kind === 'n') ny = s.y + s.h - min;
          nh = min;
          if (ratio != null) nw = nh * ratio;
        }

        nx = Math.min(stageW - nw, Math.max(0, nx));
        ny = Math.min(stageH - nh, Math.max(0, ny));
        nw = Math.min(stageW - nx, nw);
        nh = Math.min(stageH - ny, nh);

        x.value = nx;
        y.value = ny;
        w.value = nw;
        h.value = nh;
      })
      .onEnd(() => {
        runOnJS(emit)();
      });

  const boxStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));

  const dimTop = useAnimatedStyle(() => ({ height: y.value }));
  const dimBottom = useAnimatedStyle(() => ({
    top: y.value + h.value,
    height: Math.max(0, stageH - (y.value + h.value)),
  }));
  const dimLeft = useAnimatedStyle(() => ({
    top: y.value,
    height: h.value,
    width: x.value,
  }));
  const dimRight = useAnimatedStyle(() => ({
    top: y.value,
    left: x.value + w.value,
    height: h.value,
    width: Math.max(0, stageW - (x.value + w.value)),
  }));

  const handles: Array<{ key: Handle; style: object }> = useMemo(
    () => [
      { key: 'nw', style: styles.hNW },
      { key: 'ne', style: styles.hNE },
      { key: 'sw', style: styles.hSW },
      { key: 'se', style: styles.hSE },
      { key: 'n', style: styles.hN },
      { key: 's', style: styles.hS },
      { key: 'e', style: styles.hE },
      { key: 'w', style: styles.hW },
    ],
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.dimBand, dimTop]} pointerEvents="none" />
      <Animated.View style={[styles.dimBand, dimBottom]} pointerEvents="none" />
      <Animated.View style={[styles.dimSide, dimLeft]} pointerEvents="none" />
      <Animated.View style={[styles.dimSide, dimRight]} pointerEvents="none" />

      <GestureDetector gesture={makeHandle('move')}>
        <Animated.View style={[styles.cropBox, boxStyle]}>
          <View style={styles.gridH1} />
          <View style={styles.gridH2} />
          <View style={styles.gridV1} />
          <View style={styles.gridV2} />
          {handles.map((h) => (
            <GestureDetector key={h.key} gesture={makeHandle(h.key)}>
              <View style={[styles.handleHit, h.style]}>
                {h.key === 'n' || h.key === 's' ? (
                  <View style={[styles.handleBar, styles.handleBarH]} />
                ) : null}
                {h.key === 'e' || h.key === 'w' ? (
                  <View style={[styles.handleBar, styles.handleBarV]} />
                ) : null}
                {h.key === 'nw' ? <View style={[styles.corner, styles.cornerNW]} /> : null}
                {h.key === 'ne' ? <View style={[styles.corner, styles.cornerNE]} /> : null}
                {h.key === 'sw' ? <View style={[styles.corner, styles.cornerSW]} /> : null}
                {h.key === 'se' ? <View style={[styles.corner, styles.cornerSE]} /> : null}
              </View>
            </GestureDetector>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  missing: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  link: { color: colors.brand.pink, textAlign: 'center', marginTop: 12, fontWeight: '800' },
  topTools: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 10,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  stage: {
    alignSelf: 'center',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  dimBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dimSide: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  gridH1: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.33%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridH2: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '66.66%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridV1: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridV2: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '66.66%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  handleHit: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hNW: { left: -18, top: -18 },
  hNE: { right: -18, top: -18 },
  hSW: { left: -18, bottom: -18 },
  hSE: { right: -18, bottom: -18 },
  hN: { top: -18, alignSelf: 'center', left: '50%', marginLeft: -18 },
  hS: { bottom: -18, alignSelf: 'center', left: '50%', marginLeft: -18 },
  hE: { right: -18, top: '50%', marginTop: -18 },
  hW: { left: -18, top: '50%', marginTop: -18 },
  handleBar: {
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  handleBarH: { width: 28, height: 4 },
  handleBarV: { width: 4, height: 28 },
  corner: {
    width: 20,
    height: 20,
    backgroundColor: 'transparent',
    borderColor: '#fff',
  },
  cornerNW: { borderTopWidth: 4, borderLeftWidth: 4 },
  cornerNE: { borderTopWidth: 4, borderRightWidth: 4 },
  cornerSW: { borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerSE: { borderBottomWidth: 4, borderRightWidth: 4 },
  ratioScroll: { maxHeight: 96, marginTop: 14 },
  ratioRow: {
    paddingHorizontal: 16,
    gap: 14,
    alignItems: 'flex-start',
  },
  ratioItem: { alignItems: 'center', width: 72, gap: 6 },
  ratioItemActive: {},
  ratioIconBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  ratioIconBoxActive: {
    backgroundColor: 'rgba(80,80,80,0.95)',
  },
  ratioLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  ratioLabelActive: { color: '#fff' },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  footerBtn: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '700',
  },
  footerSave: { color: '#fff', fontWeight: '900' },
});
