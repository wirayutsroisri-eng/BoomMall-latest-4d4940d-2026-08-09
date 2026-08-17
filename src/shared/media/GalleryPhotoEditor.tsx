import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { FlipType, ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  ColorMatrix,
  Group,
  Image as SkImage,
  Path,
  Rect,
  Skia,
  Text as SkText,
  matchFont,
  useCanvasRef,
  useImage,
  type SkPath,
} from '@shopify/react-native-skia';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { CropFrameOverlay } from '@/shared/media/CropFrameOverlay';
import { colors } from '@/shared/theme/colors';
import { buildColorMatrix } from '@/modules/create/editor/domain/colorMatrix';
import { saveSkiaImageToCache } from '@/modules/create/editor/domain/exportSnapshot';
import {
  aspectValue,
  centeredCrop,
  cropToImagePixels,
  type AspectPreset,
  type CropRect,
} from '@/modules/create/editor/domain/cropMath';
import {
  BRUSH_COLORS,
  DEFAULT_ADJUST,
  FILTER_PRESETS,
  type AdjustValues,
  type BrushKind,
  type FilterId,
  type Point,
  type Stroke,
} from '@/modules/create/editor/domain/types';

export type GalleryEditTool = 'draw' | 'text' | 'mosaic' | 'filter' | 'crop';

type MosaicCell = { gx: number; gy: number };

type Props = {
  uri: string;
  initialTool?: GalleryEditTool;
  onClose: () => void;
  onDone: (uri: string) => void;
};

const CELL = 22;
const MOSAIC_SHADES = ['#5A5A5A', '#7C7C7C', '#484848', '#919191', '#656565'];

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

function mosaicColor(gx: number, gy: number) {
  return MOSAIC_SHADES[Math.abs(gx * 13 + gy * 7) % MOSAIC_SHADES.length];
}

const TOOLS: Array<{
  key: GalleryEditTool;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  letter?: string;
}> = [
  { key: 'text', letter: 'T', label: 'ข้อความ' },
  { key: 'draw', icon: 'pencil', label: 'วาด' },
  { key: 'mosaic', icon: 'grid', label: 'โมเสก' },
  { key: 'filter', icon: 'color-filter', label: 'ฟิลเตอร์' },
  { key: 'crop', icon: 'crop-outline', label: 'ครอป' },
];

const BRUSHES: Array<{ key: BrushKind; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'pen', label: 'ปากกา', icon: 'pencil-outline' },
  { key: 'marker', label: 'เมจิก', icon: 'brush' },
  { key: 'highlighter', label: 'ไฮไลต์', icon: 'color-fill-outline' },
  { key: 'eraser', label: 'ลบ', icon: 'backspace-outline' },
];

const TRANSFORM_OPS: Array<{
  key: 'rotate' | 'flipH' | 'flipV';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { key: 'rotate', icon: 'refresh-outline', label: 'หมุน 90°' },
  { key: 'flipH', icon: 'swap-horizontal-outline', label: 'พลิกซ้ายขวา' },
  { key: 'flipV', icon: 'swap-vertical-outline', label: 'พลิกบนล่าง' },
];

const CROP_ASPECTS: Array<{
  key: AspectPreset;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { key: 'free', icon: 'scan-outline', label: 'อิสระ' },
  { key: '16:9', icon: 'tablet-landscape-outline', label: '16:9' },
  { key: '4:3', icon: 'tablet-landscape-outline', label: '4:3' },
  { key: '1:1', icon: 'square-outline', label: '1:1' },
  { key: '9:16', icon: 'phone-portrait-outline', label: '9:16' },
];

/**
 * In-gallery photo editor — วาด / ข้อความ / โมเสก / ฟิลเตอร์ / ครอป
 * Real export via Skia snapshot + expo-image-manipulator (no coming-soon).
 */
export function GalleryPhotoEditor({ uri: sourceUri, initialTool = 'draw', onClose, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [uri, setUri] = useState(sourceUri);
  const [tab, setTab] = useState<GalleryEditTool>(initialTool);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Point[]>([]);
  const [mosaic, setMosaic] = useState<MosaicCell[]>([]);
  const [brush, setBrush] = useState<BrushKind>('pen');
  const [color, setColor] = useState<string>(BRUSH_COLORS[0]);
  const [size, setSize] = useState(6);
  const [filter, setFilter] = useState<FilterId>('none');
  const [adjust, setAdjust] = useState<AdjustValues>({ ...DEFAULT_ADJUST });
  const [caption, setCaption] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cropAspect, setCropAspect] = useState<AspectPreset>('free');
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  const canvasRef = useCanvasRef();
  const skImage = useImage(uri);
  const canvasH = Math.min(winH * 0.58, winW * (16 / 9));
  const canvasW = winW;
  const matrix = useMemo(() => buildColorMatrix(filter, adjust), [filter, adjust]);
  const drawing = tab === 'draw' || tab === 'mosaic';

  const font = useMemo(() => {
    try {
      return matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }) ?? 'sans-serif',
        fontSize: 34,
        fontWeight: '700',
      });
    } catch {
      return null;
    }
  }, []);

  const imageFit = useMemo(() => {
    if (!skImage) return { x: 0, y: 0, w: canvasW, h: canvasH };
    const iw = skImage.width();
    const ih = skImage.height();
    const scale = Math.min(canvasW / iw, canvasH / ih);
    const w = iw * scale;
    const h = ih * scale;
    return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
  }, [skImage, canvasW, canvasH]);

  const cropRatio = aspectValue(cropAspect, imageFit.w / Math.max(1, imageFit.h));

  useEffect(() => {
    if (imageFit.w < 8 || imageFit.h < 8) return;
    setCropRect(centeredCrop(imageFit.w, imageFit.h, cropRatio, cropRatio == null ? 0 : 0.04));
  }, [uri, imageFit.w, imageFit.h, cropRatio]);

  const pan = Gesture.Pan()
    .enabled(drawing && !saving)
    .minDistance(0)
    .onBegin((e) => {
      if (tab === 'mosaic') {
        const gx = Math.floor(e.x / CELL);
        const gy = Math.floor(e.y / CELL);
        setMosaic((prev) =>
          prev.some((c) => c.gx === gx && c.gy === gy) ? prev : [...prev, { gx, gy }],
        );
        return;
      }
      setLive([{ x: e.x, y: e.y }]);
    })
    .onUpdate((e) => {
      if (tab === 'mosaic') {
        const gx = Math.floor(e.x / CELL);
        const gy = Math.floor(e.y / CELL);
        setMosaic((prev) =>
          prev.some((c) => c.gx === gx && c.gy === gy) ? prev : [...prev, { gx, gy }],
        );
        return;
      }
      setLive((prev) => [...prev, { x: e.x, y: e.y }]);
    })
    .onEnd(() => {
      if (tab === 'mosaic') return;
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
    if (tab === 'mosaic') {
      setMosaic((m) => m.slice(0, -1));
      return;
    }
    setStrokes((s) => s.slice(0, -1));
  };

  const clearDraw = () => {
    void Haptics.selectionAsync();
    if (tab === 'mosaic') {
      setMosaic([]);
      return;
    }
    setStrokes([]);
    setLive([]);
  };

  const runManip = useCallback(
    async (op: (typeof TRANSFORM_OPS)[number]['key']) => {
      if (!uri || busy) return;
      setBusy(true);
      try {
        const ctx = ImageManipulator.manipulate(uri);
        if (op === 'rotate') ctx.rotate(90);
        if (op === 'flipH') ctx.flip(FlipType.Horizontal);
        if (op === 'flipV') ctx.flip(FlipType.Vertical);
        const rendered = await ctx.renderAsync();
        const saved = await rendered.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.92,
        });
        setUri(saved.uri);
        setStrokes([]);
        setLive([]);
        setMosaic([]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        Alert.alert('แก้ไขไม่สำเร็จ', 'ลองอีกครั้ง');
      } finally {
        setBusy(false);
      }
    },
    [uri, busy],
  );

  const bakeCrop = async (source: string) => {
    if (!cropRect || !skImage) return source;
    const imgW = skImage.width();
    const imgH = skImage.height();
    const px = cropToImagePixels(cropRect, imageFit.w, imageFit.h, imgW, imgH);
    if (px.width >= imgW - 4 && px.height >= imgH - 4 && px.x <= 2 && px.y <= 2) {
      return source;
    }
    const ctx = ImageManipulator.manipulate(source);
    ctx.crop({
      originX: px.x,
      originY: px.y,
      width: Math.max(2, px.width),
      height: Math.max(2, px.height),
    });
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
    return saved.uri;
  };

  const exportAndDone = async () => {
    if (!uri || saving) return;
    setSaving(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const needsBake =
        strokes.length > 0 ||
        mosaic.length > 0 ||
        caption.trim().length > 0 ||
        filter !== 'none' ||
        adjust.brightness !== 0 ||
        adjust.contrast !== 0 ||
        adjust.saturation !== 0;

      let outUri = uri;
      if (needsBake) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const snap = canvasRef.current?.makeImageSnapshot();
        if (!snap) throw new Error('snapshot failed');
        outUri = saveSkiaImageToCache(snap, 'chat-edit');
        if (cropRect) {
          const ctx = ImageManipulator.manipulate(outUri);
          ctx.crop({
            originX: Math.round(imageFit.x + cropRect.x),
            originY: Math.round(imageFit.y + cropRect.y),
            width: Math.max(2, Math.round(cropRect.width)),
            height: Math.max(2, Math.round(cropRect.height)),
          });
          const rendered = await ctx.renderAsync();
          const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
          outUri = saved.uri;
        }
      } else {
        outUri = await bakeCrop(uri);
      }
      onDone(outUri);
    } catch {
      Alert.alert('บันทึกไม่สำเร็จ', 'ลองกดเสร็จอีกครั้ง');
      setSaving(false);
    }
  };

  return (
    <DragDownDismiss onDismiss={onClose} enabled={!drawing && !saving && tab !== 'crop'} showDim={false} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <Pressable hitSlop={10} onPress={onClose} style={styles.headerBtn} accessibilityLabel="ปิด">
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
            accessibilityLabel="เสร็จ"
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.doneText}>เสร็จ</Text>}
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
                    fit="contain"
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
                  {mosaic.map((c) => (
                    <Rect
                      key={`${c.gx}-${c.gy}`}
                      x={c.gx * CELL}
                      y={c.gy * CELL}
                      width={CELL}
                      height={CELL}
                      color={mosaicColor(c.gx, c.gy)}
                    />
                  ))}
                </Group>
                {caption.trim() && font ? (
                  <SkText
                    x={24}
                    y={imageFit.y + imageFit.h - 28}
                    text={caption.trim()}
                    font={font}
                    color={textColor}
                  />
                ) : null}
              </Group>
            </Canvas>
            {!skImage ? (
              <RNImage source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            ) : null}
            {tab === 'crop' && cropRect && skImage ? (
              <View
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  left: imageFit.x,
                  top: imageFit.y,
                  width: imageFit.w,
                  height: imageFit.h,
                }}
              >
                <CropFrameOverlay
                  crop={cropRect}
                  stageW={imageFit.w}
                  stageH={imageFit.h}
                  ratio={cropRatio}
                  onCommit={setCropRect}
                />
              </View>
            ) : null}
            {busy ? (
              <View style={styles.busyMask}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            ) : null}
          </View>
        </GestureDetector>

        <View style={styles.tabRow}>
          {TOOLS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setTab(t.key);
                }}
                accessibilityLabel={t.label}
              >
                {t.letter ? (
                  <Text style={[styles.tabLetter, active && styles.tabLetterOn]}>{t.letter}</Text>
                ) : (
                  <Ionicons
                    name={t.icon!}
                    size={18}
                    color={active ? '#fff' : 'rgba(255,255,255,0.65)'}
                  />
                )}
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
                    <Ionicons name={b.icon} size={16} color={brush === b.key ? '#111' : '#fff'} />
                    <Text style={[styles.chipText, brush === b.key && styles.chipTextActive]}>{b.label}</Text>
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
                      style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
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
                  minimumTrackTintColor={colors.brand.primary}
                  maximumTrackTintColor="rgba(255,255,255,0.25)"
                  thumbTintColor="#fff"
                />
              </View>
            </>
          ) : null}

          {tab === 'mosaic' ? (
            <View style={styles.rowWrap}>
              <Text style={styles.hint}>ลากบนรูปเพื่อปิดบังเป็นโมเสก</Text>
              <Pressable style={styles.chip} onPress={undo}>
                <Ionicons name="arrow-undo-outline" size={16} color="#fff" />
                <Text style={styles.chipText}>ย้อน</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={clearDraw}>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.chipText}>ล้าง</Text>
              </Pressable>
            </View>
          ) : null}

          {tab === 'text' ? (
            <>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="พิมพ์ข้อความบนรูป"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.textInput}
                maxLength={80}
                returnKeyType="done"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {BRUSH_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setTextColor(c)}
                    style={[styles.swatch, { backgroundColor: c }, textColor === c && styles.swatchActive]}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {tab === 'filter' ? (
            <>
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
                    minimumTrackTintColor={colors.brand.primary}
                    maximumTrackTintColor="rgba(255,255,255,0.25)"
                    thumbTintColor="#fff"
                  />
                </View>
              ))}
            </>
          ) : null}

          {tab === 'crop' ? (
            <>
              <Text style={styles.hint}>ลากกรอบหรือมุมเพื่อเลือกส่วนที่ต้องการ แล้วค่อยกดเสร็จ</Text>
              <View style={styles.rowWrap}>
                {TRANSFORM_OPS.map((op) => (
                  <Pressable
                    key={op.key}
                    style={styles.chip}
                    onPress={() => void runManip(op.key)}
                    disabled={busy}
                  >
                    <Ionicons name={op.icon} size={16} color="#fff" />
                    <Text style={styles.chipText}>{op.label}</Text>
                  </Pressable>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {CROP_ASPECTS.map((op) => {
                  const active = cropAspect === op.key;
                  return (
                    <Pressable
                      key={op.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setCropAspect(op.key);
                      }}
                    >
                      <Ionicons name={op.icon} size={16} color={active ? '#111' : '#fff'} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{op.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </DragDownDismiss>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerBtn: { width: 44, height: 36, justifyContent: 'center' },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  doneBtn: {
    minWidth: 64,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2E8CFF',
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
    ...StyleSheet.absoluteFillObject,
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
  tabBtnActive: { backgroundColor: 'rgba(46,140,255,0.4)' },
  tabLetter: { color: 'rgba(255,255,255,0.65)', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  tabLetterOn: { color: '#fff' },
  tabLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '700' },
  tabLabelActive: { color: '#fff' },
  panel: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 10,
  },
  row: { gap: 8, paddingRight: 8, alignItems: 'center' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  hint: { color: 'rgba(255,255,255,0.7)', fontWeight: '600', fontSize: 13, marginRight: 4 },
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
  swatchActive: { borderColor: '#2E8CFF', transform: [{ scale: 1.1 }] },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderLabel: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', width: 78, fontSize: 12 },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolBtn: {
    width: '31%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  toolLabel: { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  filterItem: { alignItems: 'center', width: 64, gap: 4 },
  filterThumb: {
    width: 56,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterThumbActive: { borderColor: '#2E8CFF' },
  filterLabel: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
