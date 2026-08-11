import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
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
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import {
  FlipType,
  ImageManipulator,
  SaveFormat,
} from 'expo-image-manipulator';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  ColorMatrix,
  Group,
  Image as SkImage,
  Path,
  Skia,
  useCanvasRef,
  useImage,
  type SkPath,
} from '@shopify/react-native-skia';
import { colors } from '@/shared/theme/colors';
import { buildColorMatrix } from '../domain/colorMatrix';
import { saveSkiaImageToCache } from '../domain/exportSnapshot';
import {
  BRUSH_COLORS,
  DEFAULT_ADJUST,
  FILTER_PRESETS,
  type AdjustValues,
  type BrushKind,
  type EditorTab,
  type FilterId,
  type Point,
  type Stroke,
} from '../domain/types';

function toPath(points: Point[]): SkPath {
  const path = Skia.Path.Make();
  if (!points.length) return path;
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    path.quadTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
  }
  return path;
}

function brushWidth(kind: BrushKind, width: number) {
  if (kind === 'highlighter') return width * 2.6;
  if (kind === 'marker') return width * 1.55;
  if (kind === 'eraser') return width * 2.4;
  return width;
}

function brushOpacity(kind: BrushKind) {
  if (kind === 'highlighter') return 0.34;
  if (kind === 'marker') return 0.88;
  return 1;
}

const TABS: Array<{ key: EditorTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'draw', label: 'วาด', icon: 'brush-outline' },
  { key: 'crop', label: 'ครอป/หมุน', icon: 'crop-outline' },
  { key: 'filter', label: 'ฟิลเตอร์', icon: 'color-filter-outline' },
  { key: 'adjust', label: 'ปรับแสง', icon: 'options-outline' },
];

const BRUSHES: Array<{ key: BrushKind; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'pen', label: 'ปากกา', icon: 'pencil-outline' },
  { key: 'marker', label: 'เมจิก', icon: 'brush' },
  { key: 'highlighter', label: 'ไฮไลต์', icon: 'color-fill-outline' },
  { key: 'eraser', label: 'ลบ', icon: 'backspace-outline' },
];

/**
 * Full photo editor — วาด / ครอป-หมุน-พลิก / ฟิลเตอร์ / ปรับแสง
 * พลังจาก Skia + expo-image-manipulator (Expo SDK 57)
 */
export function PhotoEditorScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{ uri?: string; tab?: string }>();
  const sourceUri = typeof params.uri === 'string' ? params.uri : null;

  const [uri, setUri] = useState(sourceUri);
  const [tab, setTab] = useState<EditorTab>(
    params.tab === 'crop' || params.tab === 'filter' || params.tab === 'adjust' || params.tab === 'draw'
      ? params.tab
      : 'draw',
  );
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Point[]>([]);
  const [brush, setBrush] = useState<BrushKind>('pen');
  const [color, setColor] = useState<string>(BRUSH_COLORS[0]);
  const [size, setSize] = useState(6);
  const [filter, setFilter] = useState<FilterId>('none');
  const [adjust, setAdjust] = useState<AdjustValues>({ ...DEFAULT_ADJUST });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const canvasRef = useCanvasRef();
  const skImage = useImage(uri ?? undefined);

  const canvasH = Math.min(winH * 0.58, winW * (16 / 9));
  const canvasW = winW;
  const matrix = useMemo(() => buildColorMatrix(filter, adjust), [filter, adjust]);

  const imageFit = useMemo(() => {
    if (!skImage) return { x: 0, y: 0, w: canvasW, h: canvasH };
    const iw = skImage.width();
    const ih = skImage.height();
    const scale = Math.max(canvasW / iw, canvasH / ih);
    const w = iw * scale;
    const h = ih * scale;
    return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
  }, [skImage, canvasW, canvasH]);

  const pan = Gesture.Pan()
    .enabled(tab === 'draw' && !saving)
    .minDistance(0)
    .onBegin((e) => {
      setLive([{ x: e.x, y: e.y }]);
    })
    .onUpdate((e) => {
      setLive((prev) => [...prev, { x: e.x, y: e.y }]);
    })
    .onEnd(() => {
      setLive((points) => {
        if (points.length > 1) {
          setStrokes((prev) => [
            ...prev,
            {
              id: `s-${Date.now()}`,
              color: brush === 'eraser' ? '#000' : color,
              width: brushWidth(brush, size),
              kind: brush,
              points,
            },
          ]);
        }
        return [];
      });
    })
    .runOnJS(true);

  const undo = () => {
    void Haptics.selectionAsync();
    setStrokes((s) => s.slice(0, -1));
  };

  const clearDraw = () => {
    void Haptics.selectionAsync();
    setStrokes([]);
    setLive([]);
  };

  const runManip = useCallback(
    async (op: 'rotate' | 'flipH' | 'flipV' | 'crop43' | 'crop916') => {
      if (!uri || busy) return;
      setBusy(true);
      try {
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          RNImage.getSize(uri, (w, h) => resolve({ w, h }), reject);
        });
        const ctx = ImageManipulator.manipulate(uri);
        if (op === 'rotate') ctx.rotate(90);
        if (op === 'flipH') ctx.flip(FlipType.Horizontal);
        if (op === 'flipV') ctx.flip(FlipType.Vertical);
        if (op === 'crop43' || op === 'crop916') {
          const targetRatio = op === 'crop43' ? 3 / 4 : 9 / 16;
          let cw = dims.w;
          let ch = cw / targetRatio;
          if (ch > dims.h) {
            ch = dims.h;
            cw = ch * targetRatio;
          }
          ctx.crop({
            originX: Math.round((dims.w - cw) / 2),
            originY: Math.round((dims.h - ch) / 2),
            width: Math.round(cw),
            height: Math.round(ch),
          });
        }
        const rendered = await ctx.renderAsync();
        const saved = await rendered.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.92,
        });
        setUri(saved.uri);
        setStrokes([]);
        setLive([]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        Alert.alert('แก้ไขไม่สำเร็จ', 'ลองอีกครั้ง');
      } finally {
        setBusy(false);
      }
    },
    [uri, busy],
  );

  const exportAndDone = async () => {
    if (!uri || saving) return;
    setSaving(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const needsSkiaBake =
        strokes.length > 0 || filter !== 'none' || adjust.brightness !== 0 || adjust.contrast !== 0 || adjust.saturation !== 0;

      let outUri = uri;
      if (needsSkiaBake) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const snap = canvasRef.current?.makeImageSnapshot();
        if (!snap) throw new Error('snapshot failed');
        outUri = saveSkiaImageToCache(snap, 'photo-edit');
      }

      router.replace({
        pathname: '/create-preview',
        params: { uri: outUri, type: 'image' },
      });
    } catch {
      Alert.alert('บันทึกไม่สำเร็จ', 'ลองกดเสร็จอีกครั้ง');
      setSaving(false);
    }
  };

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
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>แต่งรูป</Text>
        <Pressable
          hitSlop={10}
          onPress={() => {
            void exportAndDone();
          }}
          style={styles.doneBtn}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.doneText}>เสร็จ</Text>
          )}
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <View style={[styles.canvasWrap, { width: canvasW, height: canvasH }]}>
          <Canvas ref={canvasRef} style={{ width: canvasW, height: canvasH }}>
            <Group>
              {skImage ? (
                <SkImage
                  image={skImage}
                  x={imageFit.x}
                  y={imageFit.y}
                  width={imageFit.w}
                  height={imageFit.h}
                  fit="cover"
                >
                  <ColorMatrix matrix={matrix} />
                </SkImage>
              ) : null}
              <Group layer>
                {strokes.map((s) => (
                  <Path
                    key={s.id}
                    path={toPath(s.points)}
                    color={s.color}
                    style="stroke"
                    strokeWidth={s.width}
                    strokeCap="round"
                    strokeJoin="round"
                    opacity={brushOpacity(s.kind)}
                    blendMode={s.kind === 'eraser' ? 'clear' : undefined}
                  />
                ))}
                {live.length > 1 ? (
                  <Path
                    path={toPath(live)}
                    color={brush === 'eraser' ? '#000' : color}
                    style="stroke"
                    strokeWidth={brushWidth(brush, size)}
                    strokeCap="round"
                    strokeJoin="round"
                    opacity={brushOpacity(brush)}
                    blendMode={brush === 'eraser' ? 'clear' : undefined}
                  />
                ) : null}
              </Group>
            </Group>
          </Canvas>
          {!skImage ? (
            <RNImage source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          {busy ? (
            <View style={styles.busyMask}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
        </View>
      </GestureDetector>

      <View style={styles.tabRow}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => {
                void Haptics.selectionAsync();
                setTab(t.key);
              }}
            >
              <Ionicons name={t.icon} size={18} color={active ? '#fff' : 'rgba(255,255,255,0.65)'} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {tab === 'draw' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {BRUSHES.map((b) => (
                <Pressable
                  key={b.key}
                  style={[styles.chip, brush === b.key && styles.chipActive]}
                  onPress={() => setBrush(b.key)}
                >
                  <Ionicons
                    name={b.icon}
                    size={16}
                    color={brush === b.key ? '#111' : '#fff'}
                  />
                  <Text style={[styles.chipText, brush === b.key && styles.chipTextActive]}>
                    {b.label}
                  </Text>
                </Pressable>
              ))}
              <Pressable style={styles.chip} onPress={undo}>
                <Ionicons name="arrow-undo-outline" size={16} color="#fff" />
                <Text style={styles.chipText}>ย้อน</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={clearDraw}>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.chipText}>ล้าง</Text>
              </Pressable>
            </ScrollView>
            {brush !== 'eraser' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {BRUSH_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={[
                      styles.swatch,
                      { backgroundColor: c },
                      color === c && styles.swatchActive,
                    ]}
                  />
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>ขนาด</Text>
              <Slider
                style={{ flex: 1 }}
                minimumValue={2}
                maximumValue={28}
                value={size}
                onValueChange={setSize}
                minimumTrackTintColor={colors.brand.pink}
                maximumTrackTintColor="rgba(255,255,255,0.25)"
                thumbTintColor="#fff"
              />
            </View>
          </>
        ) : null}

        {tab === 'crop' ? (
          <View style={styles.toolsGrid}>
            <ToolBtn
              icon="crop-outline"
              label="เปิดตัดครอบ"
              onPress={() => {
                if (!uri) return;
                router.push({ pathname: '/create-crop', params: { uri } });
              }}
            />
            <ToolBtn icon="refresh-outline" label="หมุน 90°" onPress={() => void runManip('rotate')} />
            <ToolBtn icon="swap-horizontal-outline" label="พลิกซ้ายขวา" onPress={() => void runManip('flipH')} />
            <ToolBtn icon="swap-vertical-outline" label="พลิกบนล่าง" onPress={() => void runManip('flipV')} />
          </View>
        ) : null}

        {tab === 'filter' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {FILTER_PRESETS.map((f) => (
              <Pressable
                key={f.id}
                style={styles.filterItem}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setFilter(f.id);
                }}
              >
                <View style={[styles.filterThumb, filter === f.id && styles.filterThumbActive]}>
                  <RNImage source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  {f.tint ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: f.tint }]} />
                  ) : null}
                </View>
                <Text style={styles.filterLabel}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {tab === 'adjust' ? (
          <View style={{ gap: 10 }}>
            {(
              [
                ['brightness', 'ความสว่าง'],
                ['contrast', 'คอนทราสต์'],
                ['saturation', 'ความอิ่มสี'],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>{label}</Text>
                <Slider
                  style={{ flex: 1 }}
                  minimumValue={-1}
                  maximumValue={1}
                  value={adjust[key]}
                  onValueChange={(v) => setAdjust((a) => ({ ...a, [key]: v }))}
                  minimumTrackTintColor={colors.brand.pink}
                  maximumTrackTintColor="rgba(255,255,255,0.25)"
                  thumbTintColor="#fff"
                />
              </View>
            ))}
            <Pressable
              onPress={() => setAdjust({ ...DEFAULT_ADJUST })}
              style={styles.resetBtn}
            >
              <Text style={styles.resetText}>รีเซ็ตค่าปรับแสง</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ToolBtn({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.toolBtn} onPress={onPress}>
      <Ionicons name={icon} size={22} color="#fff" />
      <Text style={styles.toolLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  missing: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  link: { color: colors.brand.pink, textAlign: 'center', marginTop: 12, fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerBtn: { width: 44, height: 36, justifyContent: 'center' },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  doneBtn: {
    minWidth: 64,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  doneText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  canvasWrap: {
    alignSelf: 'center',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  busyMask: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    gap: 6,
    marginTop: 10,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabBtnActive: { backgroundColor: 'rgba(254,44,85,0.35)' },
  tabLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700' },
  tabLabelActive: { color: '#fff' },
  panel: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 10,
  },
  row: { gap: 8, paddingRight: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chipActive: { backgroundColor: '#fff' },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: '#111' },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: colors.brand.pink, transform: [{ scale: 1.1 }] },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderLabel: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', width: 78, fontSize: 12 },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolBtn: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  toolLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filterItem: { alignItems: 'center', width: 64, gap: 4 },
  filterThumb: {
    width: 56,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterThumbActive: { borderColor: colors.brand.pink },
  filterLabel: { color: '#fff', fontSize: 10, fontWeight: '700' },
  resetBtn: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  resetText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
