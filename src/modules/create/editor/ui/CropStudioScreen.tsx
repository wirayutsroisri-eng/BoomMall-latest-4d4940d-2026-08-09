import React, { useCallback, useEffect, useState } from 'react';
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
import { colors } from '@/shared/theme/colors';
import { CropFrameOverlay } from '@/shared/media/CropFrameOverlay';
import {
  aspectValue,
  centeredCrop,
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
  { key: 'free', label: 'อิสระ', icon: 'scan-outline' },
  { key: '16:9', label: '16:9', icon: 'tablet-landscape-outline' },
  { key: '4:3', label: '4:3', icon: 'tablet-landscape-outline' },
  { key: '1:1', label: '1:1', icon: 'square-outline' },
  { key: '3:4', label: '3:4', icon: 'phone-portrait-outline' },
  { key: '9:16', label: '9:16', icon: 'tablet-portrait-outline' },
];

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
      setCrop(next);
    },
    [],
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
          <CropFrameOverlay
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
