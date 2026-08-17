import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import { colors } from '@/shared/theme/colors';
import {
  DEFAULT_OVERLAY_TRANSFORM,
  type OverlayTransform,
} from '@/modules/create/domain/overlay';
import { persistCreateMedia } from '@/modules/create/data/persistCreateMedia';
import { useCreateDraftStore } from '@/modules/create/state/create-draft-store';
import { openListenScreenNow } from '@/shared/navigation/safeNavigate';
import { ProductVideoThumb } from '@/modules/store/ui/sell/ProductVideoThumb';
import { LockedOverlayText } from './LockedOverlayText';
import { LockedStickerOverlay } from './LockedStickerOverlay';
import { MovableStickerLayer } from './MovableStickerLayer';
import { MovableTextLayer } from './MovableTextLayer';

type FilterKey = 'none' | 'vivid' | 'warm' | 'cool' | 'mono' | 'fade';
type FontKey = 'classic' | 'kanit' | 'mitr' | 'halloween';

const FILTERS: Array<{ key: FilterKey; label: string; overlay: string | null }> = [
  { key: 'none', label: 'ต้นฉบับ', overlay: null },
  { key: 'vivid', label: 'สดใส', overlay: 'rgba(255,70,90,0.14)' },
  { key: 'warm', label: 'อุ่น', overlay: 'rgba(255,150,50,0.2)' },
  { key: 'cool', label: 'เย็น', overlay: 'rgba(60,140,255,0.18)' },
  { key: 'mono', label: 'ขาวดำ', overlay: 'rgba(0,0,0,0.4)' },
  { key: 'fade', label: 'ฟุ้ง', overlay: 'rgba(255,255,255,0.2)' },
];

const FONTS: Array<{ key: FontKey; label: string }> = [
  { key: 'halloween', label: 'ฮาโลวีน' },
  { key: 'classic', label: 'Classic' },
  { key: 'kanit', label: 'Kanit' },
  { key: 'mitr', label: 'Mitr' },
];

const EDIT_TOOLS: Array<{
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { key: 'draw', icon: 'brush-outline', label: '' },
  { key: 'text', icon: 'text-outline', label: 'Aa' },
  { key: 'sticker', icon: 'happy-outline', label: '' },
  { key: 'effects', icon: 'sparkles-outline', label: '' },
  { key: 'music', icon: 'musical-notes-outline', label: '' },
  { key: 'crop', icon: 'crop-outline', label: '' },
  { key: 'editor', icon: 'color-wand-outline', label: '' },
];

const STICKERS = ['⚡', '🔥', '💥', '✨', '🔧', '💚', '🏍️', '🔋', '⭐', '❤️'];

const DEFAULT_STICKER_TRANSFORM: OverlayTransform = {
  x: 0.5,
  y: 0.42,
  scale: 1.35,
  rotation: 0,
};

/**
 * Edit step after capture — right tools, text overlay, Next → publish form.
 */
export function ContentPreviewScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    uri?: string;
    type?: string;
    textMode?: string;
    filter?: string;
  }>();

  const draftUri = useCreateDraftStore((s) => s.uri);
  const draftType = useCreateDraftStore((s) => s.type);
  const uri =
    draftUri || (typeof params.uri === 'string' ? params.uri : null);
  const mediaType =
    params.type === 'video' || draftType === 'video' ? 'video' : 'image';
  const textMode = params.textMode === '1';

  const [tool, setTool] = useState<string | null>(
    params.textMode === '1' ? 'text' : null,
  );
  const [filter, setFilter] = useState<FilterKey>(() => {
    const raw = params.filter;
    if (raw === 'vivid' || raw === 'warm' || raw === 'cool' || raw === 'mono' || raw === 'fade') {
      return raw;
    }
    return 'none';
  });
  const [overlayText, setOverlayText] = useState(params.textMode === '1' ? '' : '');
  const [overlayTransform, setOverlayTransform] = useState<OverlayTransform>({
    ...DEFAULT_OVERLAY_TRANSFORM,
  });
  const [font, setFont] = useState<FontKey>('classic');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [sticker, setSticker] = useState<string | null>(null);
  const [stickerTransform, setStickerTransform] = useState<OverlayTransform>({
    ...DEFAULT_STICKER_TRANSFORM,
  });
  /** รีมาวน์ต์เลเยอร์หลังวางกลาง / เปลี่ยนไอคอน — ให้ gesture state ตรงกับ transform */
  const [stickerEpoch, setStickerEpoch] = useState(0);
  /** แตะพื้นว่างแล้ว → บีบขยายได้ทั้งจอ */
  const [stickerResizeArmed, setStickerResizeArmed] = useState(false);
  const draftMusic = useCreateDraftStore((s) => s.music);
  const [musicTitle, setMusicTitle] = useState(draftMusic || '');
  const [textEditing, setTextEditing] = useState(params.textMode === '1');
  const [baking, setBaking] = useState(false);
  const canvasRef = useRef<View>(null);

  React.useEffect(() => {
    if (draftMusic) setMusicTitle(draftMusic);
  }, [draftMusic]);

  const activeFilter = useMemo(
    () => FILTERS.find((f) => f.key === filter) ?? FILTERS[0],
    [filter],
  );

  const setDraft = useCreateDraftStore((s) => s.setDraft);

  const goPublish = async () => {
    if (baking) return;
    if (!uri && mediaType === 'video') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const hasDecor =
      !!overlayText.trim() || !!sticker || filter !== 'none' || (textMode && !uri);
    // ภาพนิ่ง: bake ข้อความ/ฟิลเตอร์/สติกเกอร์ลงไฟล์ — ตำแหน่งตรงทุกหน้าอย่างเสถียรที่สุด
    let finalUri = uri;
    let baked = false;

    if (mediaType === 'image' && hasDecor) {
      // สลับเป็น static overlay ก่อนจับภาพ (Reanimated มักไม่ติดใน snapshot)
      setBaking(true);
      try {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        finalUri = await persistCreateMedia(
          await captureRef(canvasRef, {
            format: 'jpg',
            quality: 0.92,
            result: 'tmpfile',
          }),
          'image',
        );
        baked = true;
      } catch {
        setBaking(false);
        Alert.alert('บันทึกไม่สำเร็จ', 'ลองกดถัดไปอีกครั้ง');
        return;
      }
      setBaking(false);
    }

    if (!finalUri) {
      Alert.alert('ยังไม่มีสื่อ', 'ถ่ายหรือเลือกจากแกลเลอรีก่อนโพสต์');
      return;
    }

    setDraft({
      uri: finalUri,
      type: mediaType,
      baked,
      // เก็บข้อความไว้เติมชื่อโพสต์ — ถ้า bake แล้วจะไม่เรนเดอร์ทับอีก
      overlayText,
      overlayColor: textColor,
      overlayTransform: baked ? { ...DEFAULT_OVERLAY_TRANSFORM } : overlayTransform,
      filter: baked ? 'none' : filter,
      sticker: baked ? '' : sticker ?? '',
      music: musicTitle.trim(),
    });
    router.push({
      pathname: '/create-publish',
      params: { type: mediaType },
    });
  };

  if (!uri && !textMode) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.missing}>ไม่พบสื่อ</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.postLink}>กลับ</Text>
        </Pressable>
      </View>
    );
  }

  /** Full-screen text editor (เสร็จสิ้น) */
  if (textEditing) {
    return (
      <View style={styles.root}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.textCanvas]} />
        )}
        <View style={styles.dim} />

        <View style={[styles.textTopBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.textToolRow}>
            {(['A', 'color', 'Aa', 'align', 'fx'] as const).map((k) => (
              <Pressable
                key={k}
                style={styles.textToolBtn}
                onPress={() => {
                  if (k === 'color') {
                    const palette = ['#FFFFFF', '#FE2C55', '#FF6B8A', '#25F4EE', '#F5A524'];
                    setTextColor((c) => {
                      const i = palette.indexOf(c);
                      return palette[(i + 1) % palette.length];
                    });
                  }
                }}
              >
                {k === 'color' ? (
                  <View style={[styles.colorDot, { backgroundColor: textColor }]} />
                ) : (
                  <Text style={styles.textToolGlyph}>
                    {k === 'align' ? '☰' : k === 'fx' ? 'A✦' : k}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => {
              setTextEditing(false);
              setTool(null);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
          >
            <Text style={styles.doneLink}>เสร็จสิ้น</Text>
          </Pressable>
        </View>

        <TextInput
          style={[
            styles.centerTextInput,
            {
              color: textColor,
              fontWeight: font === 'halloween' ? '400' : '900',
              fontStyle: font === 'halloween' ? 'italic' : 'normal',
            },
          ]}
          placeholder="พิมพ์ข้อความ"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={overlayText}
          onChangeText={setOverlayText}
          multiline
          autoFocus
          textAlign="center"
        />

        <Text style={styles.moveHint}>หลังเสร็จสิ้น — ลากย้าย · บีบขยาย · หมุน · แตะเพื่อแก้</Text>

        <View style={[styles.fontBar, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
          <Text style={styles.fontBarTitle}>สไตล์</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {FONTS.map((f) => (
              <Pressable
                key={f.key}
                style={[styles.fontChip, font === f.key && styles.fontChipActive]}
                onPress={() => setFont(f.key)}
              >
                <Text style={[styles.fontChipText, font === f.key && styles.fontChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* เฉพาะเลเยอร์สื่อ — จับภาพส่วนนี้ตอนกดถัดไป (ไม่รวม UI chrome) */}
      <View ref={canvasRef} style={styles.canvas} collapsable={false}>
        {mediaType === 'video' && uri ? (
          <ProductVideoThumb
            uri={uri}
            autoPlay
            muted
            interactive={false}
            style={StyleSheet.absoluteFill}
          />
        ) : uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.textCanvas]} />
        )}
        {activeFilter.overlay ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: activeFilter.overlay }]}
          />
        ) : null}

        {overlayText.trim() ? (
          baking ? (
            <LockedOverlayText
              text={overlayText}
              color={textColor}
              transform={overlayTransform}
              italic={font === 'halloween'}
            />
          ) : (
            <MovableTextLayer
              text={overlayText}
              color={textColor}
              italic={font === 'halloween'}
              initialTransform={overlayTransform}
              onTransformChange={setOverlayTransform}
              onEdit={() => {
                setTextEditing(true);
                setTool('text');
              }}
            />
          )
        ) : null}
        {sticker ? (
          baking ? (
            <LockedStickerOverlay sticker={sticker} transform={stickerTransform} />
          ) : (
            <MovableStickerLayer
              key={`${sticker}-${stickerEpoch}`}
              sticker={sticker}
              initialTransform={stickerTransform}
              resizeArmed={stickerResizeArmed}
              onTransformChange={setStickerTransform}
              onBlankTap={() => {
                void Haptics.selectionAsync();
                setTool(null);
                setStickerResizeArmed(true);
              }}
            />
          )
        ) : null}
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
        <Pressable
          style={styles.musicPill}
          onPress={() =>
            Alert.alert('เสียงประกอบ', musicTitle, [
              { text: 'เลือกจากโหมดฟังเพลง', onPress: () => openListenScreenNow() },
              { text: 'ตกลง', style: 'cancel' },
            ])
          }
        >
          <Ionicons name="musical-notes" size={13} color="#fff" />
          <Text style={styles.musicPillText} numberOfLines={1}>
            {musicTitle || draftMusic || 'เพิ่มเสียง'}
          </Text>
        </Pressable>
        <View style={styles.topRight}>
          <Ionicons name="notifications-outline" size={22} color="#fff" />
          <Ionicons name="share-outline" size={22} color="#fff" />
        </View>
      </View>

      <View style={[styles.rightRail, { top: insets.top + 70 }]}>
        {EDIT_TOOLS.map((t) => (
          <Pressable
            key={t.key}
            style={styles.railBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              setTool(t.key);
              if (t.key === 'text') setTextEditing(true);
              if (t.key === 'music') {
                if (!openListenScreenNow()) return;
                return;
              }
              if (t.key === 'effects') setFilter((f) => (f === 'none' ? 'vivid' : 'none'));
              // ตัดครอบแบบ TikTok
              if (mediaType === 'image' && t.key === 'crop') {
                router.push({
                  pathname: '/create-crop',
                  params: { uri },
                });
                return;
              }
              // Full photo editor (Skia draw + filter + adjust)
              if (mediaType === 'image' && (t.key === 'draw' || t.key === 'editor')) {
                router.push({
                  pathname: '/create-editor',
                  params: {
                    uri,
                    tab: t.key === 'editor' ? 'filter' : 'draw',
                  },
                });
              }
            }}
          >
            {t.label === 'Aa' ? (
              <Text style={styles.aaLabel}>Aa</Text>
            ) : (
              <Ionicons name={t.icon} size={24} color="#fff" style={styles.railShadow} />
            )}
          </Pressable>
        ))}
        <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.7)" />
      </View>

      {tool === 'sticker' ? (
        <View style={styles.stickerPanel}>
          <Text style={styles.stickerHint}>
            เลือกไอคอน → แตะพื้นว่าง 1 ครั้ง → บีบสองนิ้วย่อ/ขยาย · แล้วกดถัดไป
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerRow}>
            {STICKERS.map((s) => (
              <Pressable
                key={s}
                style={[styles.stickerPick, sticker === s && styles.stickerPickActive]}
                onPress={() => {
                  void Haptics.selectionAsync();
                  if (sticker === s) {
                    setSticker(null);
                    setStickerResizeArmed(false);
                    return;
                  }
                  setSticker(s);
                  setStickerTransform({ ...DEFAULT_STICKER_TRANSFORM });
                  setStickerResizeArmed(false);
                  setStickerEpoch((n) => n + 1);
                }}
              >
                <Text style={styles.stickerEmoji}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {sticker ? (
            <View style={styles.stickerActions}>
              <Pressable
                style={styles.stickerActionBtn}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setStickerTransform({
                    ...DEFAULT_STICKER_TRANSFORM,
                    x: 0.5,
                    y: 0.5,
                    scale: 1.35,
                  });
                  setStickerResizeArmed(false);
                  setStickerEpoch((n) => n + 1);
                }}
              >
                <Ionicons name="locate-outline" size={16} color="#fff" />
                <Text style={styles.stickerActionText}>วางกลาง</Text>
              </Pressable>
              <Pressable
                style={styles.stickerActionBtn}
                onPress={() => {
                  Alert.alert('ลบสติกเกอร์?', 'จะนำสติกเกอร์นี้ออกจากภาพ', [
                    { text: 'ยกเลิก', style: 'cancel' },
                    {
                      text: 'ลบ',
                      style: 'destructive',
                      onPress: () => {
                        void Haptics.selectionAsync();
                        setSticker(null);
                        setStickerResizeArmed(false);
                      },
                    },
                  ]);
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.stickerActionText}>ลบ</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {tool === 'effects' ? (
        <ScrollView
          horizontal
          style={styles.filterStrip}
          contentContainerStyle={styles.filterStripContent}
          showsHorizontalScrollIndicator={false}
        >
          {FILTERS.map((f) => (
            <Pressable key={f.key} style={styles.filterItem} onPress={() => setFilter(f.key)}>
              <View style={[styles.filterSwatch, filter === f.key && styles.filterSwatchActive]}>
                {uri ? (
                  <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.textCanvas]} />
                )}
                {f.overlay ? (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
                ) : null}
              </View>
              <Text style={styles.filterLabel}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.bottomActions, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          style={styles.storyBtn}
          onPress={() =>
            Alert.alert(
              'สตอรี่ของคุณ',
              'บันทึกสตอรี่จะพร้อมเมื่อระบบเผยแพร่สตอรี่เปิดใช้งาน',
            )
          }
        >
          <View style={styles.storyAvatar}>
            <Ionicons name="person" size={16} color="#fff" />
          </View>
          <Text style={styles.storyText}>สตอรี่ของคุณ</Text>
        </Pressable>
        <Pressable
          style={[styles.nextBtn, baking && styles.nextBtnDisabled]}
          onPress={() => {
            void goPublish();
          }}
          disabled={baking}
        >
          {baking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextBtnText}>ถัดไป</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  canvas: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
  textCanvas: {
    backgroundColor: '#0B1F17',
  },
  missing: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  dim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 5,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 160,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  musicPillText: { color: '#fff', fontWeight: '700', fontSize: 12, flexShrink: 1 },
  topRight: { flexDirection: 'row', gap: 14, width: 70, justifyContent: 'flex-end' },
  rightRail: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 16,
    zIndex: 5,
  },
  railBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railShadow: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 4,
  },
  aaLabel: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 4,
  },
  moveHint: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 110,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  stickerPanel: {
    position: 'absolute',
    left: 12,
    right: 64,
    bottom: 118,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 12,
    borderRadius: 16,
    gap: 8,
    zIndex: 8,
  },
  stickerHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
  },
  stickerRow: { gap: 8, alignItems: 'center' },
  stickerPick: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stickerPickActive: {
    backgroundColor: 'rgba(254,44,85,0.35)',
    borderWidth: 1.5,
    borderColor: colors.brand.pink,
  },
  stickerEmoji: { fontSize: 28 },
  stickerActions: { flexDirection: 'row', gap: 8 },
  stickerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  stickerActionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  filterStrip: {
    position: 'absolute',
    left: 0,
    right: 64,
    bottom: 118,
  },
  filterStripContent: { paddingHorizontal: 12, gap: 8 },
  filterItem: { alignItems: 'center', gap: 4, width: 58 },
  filterSwatch: {
    width: 52,
    height: 68,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterSwatchActive: { borderColor: colors.brand.primary },
  filterLabel: { color: '#fff', fontSize: 10, fontWeight: '700' },
  bottomActions: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
  },
  storyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 13,
  },
  storyAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyText: { color: '#111', fontWeight: '800', fontSize: 14 },
  nextBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.live,
    borderRadius: 10,
    paddingVertical: 13,
  },
  nextBtnDisabled: { opacity: 0.7 },
  nextBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  postLink: { color: colors.brand.primary, fontWeight: '900', textAlign: 'center', marginTop: 12 },

  textTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    zIndex: 5,
  },
  textToolRow: { flexDirection: 'row', gap: 8, flex: 1 },
  textToolBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textToolGlyph: { color: '#fff', fontWeight: '800', fontSize: 13 },
  colorDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  doneLink: { color: '#fff', fontWeight: '900', fontSize: 16 },
  centerTextInput: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '38%',
    fontSize: 36,
    textShadowColor: 'rgba(254,44,85,0.9)',
    textShadowRadius: 12,
  },
  fontBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  fontBarTitle: { color: '#fff', fontWeight: '800', marginRight: 4 },
  fontChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  fontChipActive: {
    backgroundColor: '#fff',
  },
  fontChipText: { color: '#fff', fontWeight: '700' },
  fontChipTextActive: { color: '#111', fontWeight: '900' },
});
