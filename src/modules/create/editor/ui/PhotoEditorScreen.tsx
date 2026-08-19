import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
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
import { computeContainMediaSize } from '@/modules/create/domain/mediaContain';
import {
  DEFAULT_OVERLAY_TRANSFORM,
  type OverlayTransform,
} from '@/modules/create/domain/overlay';
import {
  OVERLAY_FONTS,
  OVERLAY_TEXT_BACKGROUNDS,
  OVERLAY_TEXT_COLORS,
  type OverlayFontKey,
} from '@/modules/create/domain/overlayText';
import { MovableTextLayer } from '@/modules/create/ui/MovableTextLayer';
import { useCreateDraftStore } from '@/modules/create/state/create-draft-store';


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
  { key: 'text', label: 'ข้อความ', icon: 'text-outline' },
  { key: 'background', label: 'พื้นหลัง', icon: 'image-outline' },
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
 * Per-photo editor canvas + tools. Owns all editor state for a single photo so
 * the parent pager can swipe between photos without losing each photo's edits.
 */
function PhotoEditorCanvas({
  uri,
  initialTab,
  onEditedUri,
}: {
  uri: string;
  initialTab?: EditorTab;
  onEditedUri: (uri: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const [tab, setTab] = useState<EditorTab>(initialTab ?? 'draw');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Point[]>([]);
  const [brush, setBrush] = useState<BrushKind>('pen');
  const [color, setColor] = useState<string>(BRUSH_COLORS[0]);
  const [size, setSize] = useState(6);
  const [filter, setFilter] = useState<FilterId>('none');
  const [adjust, setAdjust] = useState<AdjustValues>({ ...DEFAULT_ADJUST });
  const [busy, setBusy] = useState(false);

  // ข้อความตกแต่ง (TikTok-style)
  const [overlayText, setOverlayText] = useState('');
  const [textColor, setTextColor] = useState<string>(OVERLAY_TEXT_COLORS[0]);
  const [textBackground, setTextBackground] = useState<string | null>(null);
  const [fontKey, setFontKey] = useState<OverlayFontKey>('classic');
  const [overlayTransform, setOverlayTransform] = useState<OverlayTransform>({
    ...DEFAULT_OVERLAY_TRANSFORM,
  });
  const [textDraft, setTextDraft] = useState('');
  const [kbHeight, setKbHeight] = useState(0);
  const [textFocused, setTextFocused] = useState(false);

  // พื้นหลัง
  const [backgroundUri, setBackgroundUri] = useState<string | null>(null);

  const canvasRef = useCanvasRef();
  const skImage = useImage(uri);
  const stageRef = useRef<View>(null);

  const availableH = winH * 0.58;
  const canvasSize = useMemo(() => {
    if (!skImage) return { width: winW, height: availableH };
    const iw = skImage.width();
    const ih = skImage.height();
    return computeContainMediaSize(winW, availableH, iw, ih);
  }, [skImage, winW, availableH]);
  const canvasW = canvasSize.width;
  const canvasH = canvasSize.height;

  const matrix = useMemo(() => buildColorMatrix(filter, adjust), [filter, adjust]);

  const imageFit = useMemo(() => {
    if (!skImage) return { x: 0, y: 0, w: canvasW, h: canvasH };
    const iw = skImage.width();
    const ih = skImage.height();
    const scale = Math.min(canvasW / iw, canvasH / ih);
    const w = iw * scale;
    const h = ih * scale;
    return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
  }, [skImage, canvasW, canvasH]);


  const pan = Gesture.Pan()
    .enabled(tab === 'draw' && !busy)
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
      if (busy) return;
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
        const saved = await rendered.saveAsync({ format: SaveFormat.PNG });
        onEditedUri(saved.uri);
        setStrokes([]);
        setLive([]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        Alert.alert('แก้ไขไม่สำเร็จ', 'ลองอีกครั้ง');
      } finally {
        setBusy(false);
      }
    },
    [uri, busy, onEditedUri],
  );

  const pickBackground = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('ต้องอนุญาตเข้าถึงรูปภาพ', 'เปิดสิทธิ์ในตั้งค่าเพื่อเลือกภาพพื้นหลัง');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    void Haptics.selectionAsync();
    setBackgroundUri(result.assets[0].uri);
  };

  const removeBackground = () => {
    Alert.alert('ลบภาพพื้นหลัง?', 'จะนำภาพพื้นหลังนี้ออกจากภาพ', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          void Haptics.selectionAsync();
          setBackgroundUri(null);
        },
      },
    ]);
  };

  const startTextEdit = () => {
    setTextDraft(overlayText);
    setTab('text');
  };

  const finishTextEdit = () => {
    const next = textDraft.trim();
    setOverlayText(next);
  };

  React.useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKbHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setKbHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const exportAndDone = async () => {
    if (busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const hasDecor =
        strokes.length > 0 ||
        filter !== 'none' ||
        adjust.brightness !== 0 ||
        adjust.contrast !== 0 ||
        adjust.saturation !== 0 ||
        !!overlayText.trim() ||
        !!backgroundUri;

      let outUri = uri;
      if (hasDecor) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (overlayText.trim() || backgroundUri) {
          const shot = await captureRef(stageRef, {
            format: 'jpg',
            quality: 0.92,
            result: 'tmpfile',
          });
          outUri = shot;
        } else {
          const snap = canvasRef.current?.makeImageSnapshot();
          if (!snap) throw new Error('snapshot failed');
          outUri = saveSkiaImageToCache(snap, 'photo-edit');
        }
      }
      onEditedUri(outUri);
    } catch {
      Alert.alert('บันทึกไม่สำเร็จ', 'ลองกดเสร็จอีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.canvasRoot, { paddingTop: insets.top }]}>
      <View
        ref={stageRef}
        collapsable={false}
        style={[styles.canvasWrap, { width: canvasW, height: canvasH }]}
      >
        {backgroundUri ? (
          <RNImage
            source={{ uri: backgroundUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : null}
        <GestureDetector gesture={pan}>
          <View style={{ width: canvasW, height: canvasH }}>
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
                </Group>
              </Group>
            </Canvas>
            {!skImage ? (
              <RNImage source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            ) : null}
          </View>
        </GestureDetector>
        {overlayText.trim() ? (
          <MovableTextLayer
            text={overlayText}
            color={textColor}
            fontKey={fontKey}
            italic={fontKey === 'halloween'}
            background={textBackground}
            initialTransform={overlayTransform}
            interactive={tab === 'text'}
            onTransformChange={setOverlayTransform}
            onEdit={startTextEdit}
          />
        ) : null}
        {busy ? (
          <View style={styles.busyMask}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
      </View>


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

        {tab === 'text' ? (
          <>
            <View style={styles.textInputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="พิมพ์ข้อความ"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={textDraft}
                onChangeText={setTextDraft}
                multiline
                maxLength={120}
                selectionColor={textColor}
                onFocus={() => setTextFocused(true)}
                onBlur={() => setTextFocused(false)}
              />
              <Pressable
                style={styles.textAddBtn}
                onPress={() => {
                  void Haptics.selectionAsync();
                  finishTextEdit();
                }}
              >
                <Text style={styles.textAddBtnText}>เพิ่ม</Text>
              </Pressable>
            </View>
            <Text style={styles.panelHint}>
              แตะข้อความบนภาพเพื่อแก้ไข · ใช้นิ้วจีบ (pinch) ย่อ/ขยาย · ลากย้าย · หมุนได้
            </Text>
            <View style={styles.styleBar}>
              <Text style={styles.styleBarLabel}>สีตัวอักษร</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {OVERLAY_TEXT_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setTextColor(c);
                    }}
                    style={[
                      styles.swatch,
                      { backgroundColor: c },
                      textColor === c && styles.swatchActive,
                    ]}
                  />
                ))}
              </ScrollView>
            </View>
            <View style={styles.styleBar}>
              <Text style={styles.styleBarLabel}>สีพื้นหลัง</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {OVERLAY_TEXT_BACKGROUNDS.map((b) => (
                  <Pressable
                    key={b.key ?? 'none'}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setTextBackground(b.key);
                    }}
                    style={[
                      styles.bgSwatch,
                      { backgroundColor: b.color },
                      textBackground === b.key && styles.swatchActive,
                    ]}
                  >
                    {b.key === null ? (
                      <Ionicons name="close" size={16} color="#fff" />
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {OVERLAY_FONTS.map((f) => (
                <Pressable
                  key={f.key}
                  style={[styles.chip, fontKey === f.key && styles.chipActive]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setFontKey(f.key);
                  }}
                >
                  <Text style={[styles.chipText, fontKey === f.key && styles.chipTextActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {overlayText.trim() ? (
              <Pressable
                style={styles.resetBtn}
                onPress={() => {
                  Alert.alert('ลบข้อความ?', 'จะนำข้อความนี้ออกจากภาพ', [
                    { text: 'ยกเลิก', style: 'cancel' },
                    {
                      text: 'ลบ',
                      style: 'destructive',
                      onPress: () => {
                        void Haptics.selectionAsync();
                        setOverlayText('');
                        setOverlayTransform({ ...DEFAULT_OVERLAY_TRANSFORM });
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.resetText}>ลบข้อความ</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {tab === 'background' ? (
          <View style={styles.toolsGrid}>
            <ToolBtn
              icon="image-outline"
              label="เลือกภาพพื้นหลัง"
              onPress={() => void pickBackground()}
            />
            {backgroundUri ? (
              <ToolBtn
                icon="trash-outline"
                label="ลบพื้นหลัง"
                onPress={removeBackground}
              />
            ) : null}
          </View>
        ) : null}

        {tab === 'crop' ? (
          <View style={styles.toolsGrid}>
            <ToolBtn
              icon="crop-outline"
              label="เปิดตัดครอบ"
              onPress={() => {
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
                style={[styles.chip, filter === f.id && styles.chipActive]}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setFilter(f.id);
                }}
              >
                <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {tab === 'adjust' ? (
          <View style={styles.adjustList}>
            <AdjustRow
              label="ความสว่าง"
              value={adjust.brightness}
              min={-1}
              max={1}
              onChange={(v) => setAdjust((a) => ({ ...a, brightness: v }))}
            />
            <AdjustRow
              label="คอนทราสต์"
              value={adjust.contrast}
              min={-1}
              max={1}
              onChange={(v) => setAdjust((a) => ({ ...a, contrast: v }))}
            />
            <AdjustRow
              label="ความอิ่มตัว"
              value={adjust.saturation}
              min={-1}
              max={1}
              onChange={(v) => setAdjust((a) => ({ ...a, saturation: v }))}
            />
            <Pressable
              style={styles.resetBtn}
              onPress={() => {
                void Haptics.selectionAsync();
                setAdjust({ ...DEFAULT_ADJUST });
              }}
            >
              <Text style={styles.resetText}>รีเซ็ตการปรับ</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AdjustRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.adjustRow}>
      <Text style={styles.adjustLabel}>{label}</Text>
      <Slider
        style={{ flex: 1 }}
        minimumValue={min}
        maximumValue={max}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.brand.pink}
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor="#fff"
      />
      <Text style={styles.adjustValue}>{value.toFixed(2)}</Text>
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
      <Text style={styles.toolBtnText}>{label}</Text>
    </Pressable>
  );
}

/**
 * TikTok-style photo posting first page. After picking photos we land here
 * directly. Swipe left/right to switch between photos; each photo keeps its own
 * editor state. "ถัดไป" renders all edited photos and goes to publish.
 */
export function PhotoEditorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uri?: string; uris?: string; tab?: string }>();
  const { width: winW } = useWindowDimensions();

  const uris = useMemo(() => {
    if (params.uris) return params.uris.split('|').filter(Boolean);
    if (params.uri) return [params.uri];
    return [];
  }, [params.uris, params.uri]);

  const initialTab = useMemo<EditorTab | undefined>(() => {
    if (params.tab === 'draw') return 'draw';
    if (params.tab === 'filter') return 'filter';
    if (params.tab === 'text') return 'text';
    return undefined;
  }, [params.tab]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [editedUris, setEditedUris] = useState<Record<string, string>>({});
  const [baking, setBaking] = useState(false);
  const pagerRef = useRef<ScrollView>(null);

  const handleEditedUri = useCallback((uri: string, edited: string) => {
    setEditedUris((prev) => ({ ...prev, [uri]: edited }));
  }, []);

  const goPublish = async () => {
    if (baking || !uris.length) return;
    setBaking(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Render each edited photo (bake decor) then pass all URIs to publish.
      const finalUris = uris.map((u) => editedUris[u] ?? u);
      // Seed the draft store so the publish screen picks up all edited photos.
      useCreateDraftStore.getState().setDraft({
        uri: finalUris[0] ?? null,
        type: 'image',
        mediaUris: finalUris,
      });
      router.push({
        pathname: '/create-publish',
        params: { type: 'image' },
      });
    } finally {
      setBaking(false);
    }
  };


  if (!uris.length) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.missing}>ไม่พบรูปภาพ</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.postLink}>กลับ</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>
          {activeIndex + 1} / {uris.length}
        </Text>
        <Pressable
          style={[styles.nextBtn, baking && styles.nextBtnDisabled]}
          onPress={() => void goPublish()}
          disabled={baking}
        >
          {baking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.nextBtnText}>ถัดไป</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / winW);
          setActiveIndex(Math.max(0, Math.min(uris.length - 1, idx)));
        }}
        style={styles.pager}
      >
        {uris.map((u, index) => (
          <View key={u} style={{ width: winW }}>
            <PhotoEditorCanvas
              uri={u}
              initialTab={index === 0 ? initialTab : undefined}
              onEditedUri={(edited) => handleEditedUri(u, edited)}
            />
          </View>
        ))}
      </ScrollView>

      {uris.length > 1 ? (
        <View style={[styles.thumbStrip, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {uris.map((u, index) => (
              <Pressable
                key={u}
                onPress={() => {
                  void Haptics.selectionAsync();
                  pagerRef.current?.scrollTo({ x: index * winW, animated: true });
                  setActiveIndex(index);
                }}
                style={[styles.thumbWrap, activeIndex === index && styles.thumbWrapActive]}
              >
                <RNImage source={{ uri: editedUris[u] ?? u }} style={styles.thumb} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  canvasRoot: { flex: 1, backgroundColor: '#000' },
  canvasWrap: {
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  busyMask: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 20,
  },
  missing: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  postLink: { color: colors.brand.primary, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    zIndex: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  nextBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.7 },
  nextBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  pager: { flex: 1 },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(20,20,20,0.95)',
  },
  tabBtn: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tabBtnActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  tabLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '700' },
  tabLabelActive: { color: '#fff', fontWeight: '900' },
  panel: {
    backgroundColor: 'rgba(20,20,20,0.95)',
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  row: { gap: 8, alignItems: 'center', paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: { backgroundColor: '#fff' },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: '#111', fontWeight: '900' },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: '#fff' },
  bgSwatch: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderLabel: { color: '#fff', fontWeight: '700', fontSize: 12, width: 44 },
  textInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 90,
  },
  textAddBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.brand.pink,
  },
  textAddBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  panelHint: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
  styleBar: { gap: 6 },
  styleBarLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(254,44,85,0.2)',
  },
  resetText: { color: '#ff6b81', fontWeight: '800', fontSize: 12 },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolBtn: {
    width: '48%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  toolBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  adjustList: { gap: 10 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adjustLabel: { color: '#fff', fontWeight: '700', fontSize: 12, width: 84 },
  adjustValue: { color: 'rgba(255,255,255,0.6)', fontSize: 11, width: 40, textAlign: 'right' },
  thumbStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingTop: 8,
  },
  thumbRow: { gap: 8, paddingHorizontal: 12 },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbWrapActive: { borderColor: colors.accent.live },
  thumb: { width: '100%', height: '100%' },
});

