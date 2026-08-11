import React, { useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useCreateDraftStore } from '@/modules/create/state/create-draft-store';
import {
  MediaGalleryPicker,
  type PickedGalleryItem,
} from '@/shared/media/MediaGalleryPicker';
import { openListenScreenNow } from '@/shared/navigation/safeNavigate';
import { ENABLE_SIMULATED_CAMERA_TOOLS } from '@/shared/compliance/appStoreGates';
import { colors } from '@/shared/theme/colors';

type CaptureMode = '10m' | '60s' | '15s' | 'photo' | 'text';

const MODES: Array<{ key: CaptureMode; label: string }> = [
  { key: '10m', label: '10 นาที' },
  { key: '60s', label: '60 วินาที' },
  { key: '15s', label: '15 วินาที' },
  { key: 'photo', label: 'รูปภาพ' },
  { key: 'text', label: 'ข้อความ' },
];

const RIGHT_TOOLS: Array<{
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { key: 'flip', icon: 'camera-reverse-outline', label: 'พลิก' },
  { key: 'speed', icon: 'flash-outline', label: 'ความเร็ว' },
  { key: 'timer', icon: 'timer-outline', label: 'ตัวจับเวลา' },
  { key: 'grid', icon: 'grid-outline', label: 'กรอบ' },
  { key: 'beauty', icon: 'sparkles-outline', label: 'รีทัช' },
  { key: 'filters', icon: 'color-filter-outline', label: 'ฟิลเตอร์' },
];

const EFFECT_THUMBS = [
  'https://picsum.photos/seed/fx-a/120/120',
  'https://picsum.photos/seed/fx-b/120/120',
  'https://picsum.photos/seed/fx-c/120/120',
];

/**
 * TikTok-style camera — content only.
 * Capture / gallery → /create-preview (edit) → /create-publish
 */
export function CameraStudioScreen() {
  const insets = useSafeAreaInsets();
  const draftMusic = useCreateDraftStore((s) => s.music);
  const [mode, setMode] = useState<CaptureMode>('15s');
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [showGrid, setShowGrid] = useState(true);
  const [bottomTab, setBottomTab] = useState<'camera' | 'creative' | 'live'>('camera');
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const modeScrollRef = useRef<ScrollView>(null);

  const isPhoto = mode === 'photo' || mode === 'text';

  const goPreview = (uri: string, type: 'image' | 'video') => {
    setLastThumb(uri);
    router.push({
      pathname: '/create-preview',
      params: { uri, type },
    });
  };

  const openCamera = async () => {
    if (mode === 'text') {
      router.push({
        pathname: '/create-preview',
        params: {
          uri: 'https://picsum.photos/seed/boom-text-canvas/1080/1920',
          type: 'image',
          textMode: '1',
        },
      });
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์กล้อง', 'กรุณาอนุญาตให้ BoomMall ใช้กล้องเพื่อถ่ายคอนเทนต์');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: isPhoto ? ['images'] : ['videos'],
      // ข้ามหน้า Cancel/Choose ของระบบ — เข้าพรีวิวแต่งรูป BoomMall ทันที
      allowsEditing: false,
      quality: 0.85,
      cameraType:
        facing === 'front'
          ? ImagePicker.CameraType.front
          : ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      goPreview(asset.uri, asset.type === 'video' || !isPhoto ? 'video' : 'image');
    }
  };

  const openLibrary = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGalleryOpen(true);
  };

  const onGallerySend = (items: PickedGalleryItem[]) => {
    setGalleryOpen(false);
    const first = items[0];
    if (!first) return;
    // First selected media enters create preview; multi-select keeps order for future batch
    goPreview(first.uri, first.mediaType === 'video' ? 'video' : 'image');
  };

  const onRail = (key: string) => {
    void Haptics.selectionAsync();
    if (key === 'flip') {
      setFacing((f) => (f === 'back' ? 'front' : 'back'));
      return;
    }
    if (key === 'grid') {
      setShowGrid((g) => !g);
      return;
    }
    Alert.alert(
      'เครื่องมือกล้อง',
      ENABLE_SIMULATED_CAMERA_TOOLS
        ? 'พร้อมใช้ในโหมดถ่ายจริง — จำลองการตั้งค่าแล้ว'
        : 'เครื่องมือนี้ยังไม่พร้อมในเวอร์ชันนี้ — ใช้เลือกจากคลังภาพด้านล่างได้',
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#2a2218', '#12100e', '#050505']} style={StyleSheet.absoluteFill} />

      {showGrid ? (
        <>
          <View style={[styles.gridH, { top: '33%' }]} />
          <View style={[styles.gridH, { top: '66%' }]} />
          <View style={[styles.gridV, { left: '33%' }]} />
          <View style={[styles.gridV, { left: '66%' }]} />
        </>
      ) : null}

      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={30} color="#fff" />
        </Pressable>
        <Pressable
          style={styles.soundPill}
          onPress={() => {
            if (draftMusic) {
              Alert.alert('เสียงที่เลือก', draftMusic, [
                { text: 'เปลี่ยนเสียง', onPress: () => openListenScreenNow() },
                { text: 'ตกลง', style: 'cancel' },
              ]);
            } else {
              openListenScreenNow();
            }
          }}
        >
          <Ionicons name="musical-notes" size={15} color="#fff" />
          <Text style={styles.soundPillText} numberOfLines={1}>
            {draftMusic || 'เพิ่มเสียง'}
          </Text>
        </Pressable>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.rightRail, { top: insets.top + 72 }]}>
        {RIGHT_TOOLS.map((t) => (
          <Pressable key={t.key} style={styles.railBtn} onPress={() => onRail(t.key)}>
            <Ionicons name={t.icon} size={26} color="#fff" style={styles.railShadow} />
            <Text style={styles.railLabel}>{t.label}</Text>
          </Pressable>
        ))}
        <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.7)" />
      </View>

      <View style={[styles.bottomStack, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <ScrollView
          ref={modeScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modeRow}
        >
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  setMode(m.key);
                  void Haptics.selectionAsync();
                }}
                style={[styles.modeChip, active && styles.modeChipActive]}
              >
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.shutterRow}>
          <Pressable style={styles.galleryBtn} onPress={openLibrary}>
            {lastThumb ? (
              <Image source={{ uri: lastThumb }} style={styles.galleryImg} />
            ) : (
              <View style={styles.galleryEmpty}>
                <Ionicons name="images" size={18} color="#fff" />
              </View>
            )}
          </Pressable>

          <Image source={{ uri: EFFECT_THUMBS[0] }} style={styles.fxThumb} />

          <Pressable onPress={openCamera} hitSlop={8}>
            <View style={[styles.shutterRing, isPhoto && styles.shutterRingPhoto]}>
              <View style={[styles.shutterCore, isPhoto && styles.shutterCorePhoto]} />
            </View>
          </Pressable>

          <Image source={{ uri: EFFECT_THUMBS[1] }} style={styles.fxThumb} />
          <Image source={{ uri: EFFECT_THUMBS[2] }} style={styles.fxThumb} />
        </View>

        <View style={styles.bottomTabs}>
          {(
            [
              { key: 'camera' as const, label: 'กล้อง' },
              { key: 'creative' as const, label: 'สร้างสรรค์' },
              { key: 'live' as const, label: 'LIVE' },
            ]
          ).map((t) => {
            const active = bottomTab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  setBottomTab(t.key);
                  if (t.key === 'live') {
                    Alert.alert('LIVE', 'เริ่มไลฟ์สด BoomMall');
                  }
                  if (t.key === 'creative') {
                    void openLibrary();
                  }
                }}
              >
                <Text style={[styles.bottomTabText, active && styles.bottomTabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <MediaGalleryPicker
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSend={onGallerySend}
        initialMode={isPhoto ? 'photo' : 'video'}
        allowModeSwitch
        selectionLimit={9}
        sendLabel="ส่ง"
        title="ล่าสุด"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
  },
  soundPillText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rightRail: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 18,
  },
  railBtn: { alignItems: 'center', gap: 3, width: 58 },
  railShadow: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 4,
  },
  railLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 14,
  },
  modeRow: {
    paddingHorizontal: 40,
    gap: 8,
    alignItems: 'center',
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modeChipActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  modeText: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    fontSize: 13,
  },
  modeTextActive: {
    color: '#111',
    fontWeight: '900',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 12,
  },
  galleryBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  galleryImg: { width: '100%', height: '100%' },
  galleryEmpty: {
    flex: 1,
    backgroundColor: colors.brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fxThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  shutterRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    borderColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  shutterRingPhoto: {
    borderColor: '#fff',
  },
  shutterCore: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accent.live,
  },
  shutterCorePhoto: {
    backgroundColor: '#fff',
  },
  bottomTabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingTop: 4,
  },
  bottomTabText: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
    fontSize: 14,
  },
  bottomTabTextActive: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
  },
});
