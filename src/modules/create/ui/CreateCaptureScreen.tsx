import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { resolveDisplayUri, resolveVideoThumbnailUri, isVideoAsset } from '@/shared/media/resolveMediaLibraryUri';
import {
  beginCreateFromUri,
  captureWithDeviceCamera,
  isIosSimulator,
  pickCreateMediaFromLibrary,
} from '@/modules/create/data/openDeviceCapture';
import { loadLiveCameraModule, captureFallbackReason } from '@/modules/create/data/createCaptureCameraBridge';
import type { LiveCameraHandle } from '@/modules/create/ui/CreateCaptureLiveCamera';
import { openListenScreenNow, setRouteMounted } from '@/shared/navigation/safeNavigate';
import { useMusicPlayerStore } from '@/modules/music/state/music-player-store';
import { useCreateDraftStore } from '@/modules/create/state/create-draft-store';
import {
  DEFAULT_OVERLAY_TRANSFORM,
  type OverlayTransform,
} from '@/modules/create/domain/overlay';
import { useCameraPreviewLayout } from '@/modules/create/domain/cameraPreviewLayout';
import { InteractiveTextOverlay } from './InteractiveTextOverlay';
import type { OverlayFontKey } from '@/modules/create/domain/overlayText';

type CaptureMode = 'photo' | 'video15' | 'video60';
type TimerOption = 0 | 3 | 10;
type FilterKey = 'none' | 'vivid' | 'warm' | 'cool' | 'mono' | 'fade';
type CaptureFacing = 'front' | 'back';
type CaptureFlash = 'off' | 'on' | 'auto';

const MODES: Array<{ key: CaptureMode; label: string }> = [
  { key: 'photo', label: 'ภาพถ่าย' },
  { key: 'video15', label: 'วิดีโอ 15s' },
  { key: 'video60', label: 'วิดีโอ 60s' },
];

const FILTERS: Array<{ key: FilterKey; label: string; overlay: string | null }> = [
  { key: 'none', label: 'ต้นฉบับ', overlay: null },
  { key: 'vivid', label: 'สดใส', overlay: 'rgba(255,70,90,0.14)' },
  { key: 'warm', label: 'อุ่น', overlay: 'rgba(255,150,50,0.2)' },
  { key: 'cool', label: 'เย็น', overlay: 'rgba(60,140,255,0.18)' },
  { key: 'mono', label: 'ขาวดำ', overlay: 'rgba(0,0,0,0.4)' },
  { key: 'fade', label: 'ฟุ้ง', overlay: 'rgba(255,255,255,0.2)' },
];

const TIMER_OPTIONS: TimerOption[] = [0, 3, 10];

function GlassIconButton({
  icon,
  label,
  active,
  onPress,
  size = 22,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  active?: boolean;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sideBtnWrap} hitSlop={6}>
      <BlurView intensity={32} tint="dark" style={[styles.glassCircle, active && styles.glassCircleActive]}>
        <Ionicons name={icon} size={size} color="#fff" />
      </BlurView>
      {label ? <Text style={styles.sideBtnLabel}>{label}</Text> : null}
    </Pressable>
  );
}

/**
 * TikTok-style in-app camera — full-screen live preview, overlay controls, gallery sheet.
 */
export function CreateCaptureScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const liveCameraRef = useRef<LiveCameraHandle>(null);
  const liveModule = useMemo(() => loadLiveCameraModule(), []);
  const hasLiveCamera = liveModule != null;
  const cameraFallbackHint = useMemo(() => captureFallbackReason(), []);
  const simulator = isIosSimulator();

  const [cameraPermissionGranted, setCameraPermissionGranted] = useState<boolean | null>(
    hasLiveCamera ? null : false,
  );
  const [fallbackPermission, setFallbackPermission] = useState<ImagePicker.PermissionResponse | null>(
    null,
  );

  const [facing, setFacing] = useState<CaptureFacing>('back');
  const [flash, setFlash] = useState<CaptureFlash>('off');
  const [mode, setMode] = useState<CaptureMode>('photo');
  const [timer, setTimer] = useState<TimerOption>(0);
  const [filter, setFilter] = useState<FilterKey>('none');
  const [showFilters, setShowFilters] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [latestThumb, setLatestThumb] = useState<string | null>(null);
  const [pickingGallery, setPickingGallery] = useState(false);

  const [overlayText, setOverlayText] = useState('');
  const [overlayColor, setOverlayColor] = useState('#FFFFFF');
  const [overlayFont, setOverlayFont] = useState<OverlayFontKey>('classic');
  const [overlayTransform, setOverlayTransform] = useState<OverlayTransform>({
    ...DEFAULT_OVERLAY_TRANSFORM,
  });
  const [textEditing, setTextEditing] = useState(false);

  const holdRecording = useRef(false);
  const recordTicker = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressActive = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDuration = mode === 'video15' ? 15 : mode === 'video60' ? 60 : 15;

  const draftMusic = useCreateDraftStore((s) => s.music);
  const draftMusicArtist = useCreateDraftStore((s) => s.musicArtist);

  const filterOverlay = useMemo(
    () => FILTERS.find((f) => f.key === filter)?.overlay ?? null,
    [filter],
  );

  const previewLayout = useCameraPreviewLayout(mode);

  const cameraActive = focused && !pickingGallery && !simulator && !!cameraPermissionGranted;

  const dismiss = useCallback(() => {
    if (recording && hasLiveCamera) liveCameraRef.current?.stopRecording();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [hasLiveCamera, recording]);

  useEffect(() => {
    setRouteMounted('create-capture', true);
    useMusicPlayerStore.getState().pause();
    return () => setRouteMounted('create-capture', false);
  }, []);

  useEffect(() => {
    if (simulator) return;
    void (async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      setFallbackPermission(perm);
      if (!hasLiveCamera) {
        setCameraPermissionGranted(perm.granted);
        if (perm.granted) setCameraReady(true);
      }
    })();
  }, [hasLiveCamera, simulator]);

  const requestFallbackCameraPermission = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    setFallbackPermission(perm);
    setCameraPermissionGranted(perm.granted);
    if (perm.granted) setCameraReady(true);
  }, []);

  const refreshLatestThumb = useCallback(async () => {
    try {
      const perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted) return;
      const page = await MediaLibrary.getAssetsAsync({
        first: 1,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const asset = page.assets[0];
      if (!asset) return;
      const uri = isVideoAsset(asset)
        ? await resolveVideoThumbnailUri(asset)
        : await resolveDisplayUri(asset);
      if (uri) setLatestThumb(uri);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshLatestThumb();
  }, [refreshLatestThumb, pickingGallery]);

  const syncDraftOverlays = useCallback(() => {
    useCreateDraftStore.getState().setDraft({
      overlayText,
      overlayColor,
      overlayTransform,
      filter,
    });
  }, [overlayColor, overlayText, overlayTransform, filter]);

  const stopRecordTicker = useCallback(() => {
    if (recordTicker.current) {
      clearInterval(recordTicker.current);
      recordTicker.current = null;
    }
  }, []);

  const startRecordTicker = useCallback(() => {
    stopRecordTicker();
    setRecordSec(0);
    recordTicker.current = setInterval(() => {
      setRecordSec((s) => s + 1);
    }, 1000);
  }, [stopRecordTicker]);

  useEffect(() => () => stopRecordTicker(), [stopRecordTicker]);

  const finishCapture = useCallback(
    async (uri: string, type: 'image' | 'video') => {
      syncDraftOverlays();
      await beginCreateFromUri(uri, type);
    },
    [syncDraftOverlays],
  );

  const openGallery = useCallback(async () => {
    void Haptics.selectionAsync();
    syncDraftOverlays();
    setPickingGallery(true);
    try {
      await pickCreateMediaFromLibrary();
    } finally {
      setPickingGallery(false);
      void refreshLatestThumb();
    }
  }, [refreshLatestThumb, syncDraftOverlays]);

  const takePhoto = useCallback(async () => {
    if (busy || simulator) return;
    if (hasLiveCamera) {
      if (!cameraReady) return;
      setBusy(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      try {
        const uri = await liveCameraRef.current?.takePhoto();
        if (uri) {
          await finishCapture(uri, 'image');
          return;
        }
      } catch {
        /* fall through to system camera */
      } finally {
        setBusy(false);
      }
    }
    setBusy(true);
    syncDraftOverlays();
    try {
      await captureWithDeviceCamera('photo', facing);
    } finally {
      setBusy(false);
    }
  }, [busy, cameraReady, facing, finishCapture, hasLiveCamera, simulator, syncDraftOverlays]);

  const runWithTimer = useCallback(
    async (action: () => Promise<void>) => {
      if (timer <= 0) {
        await action();
        return;
      }
      for (let i = timer; i > 0; i -= 1) {
        setCountdown(i);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);
      await action();
    },
    [timer],
  );

  const startRecording = useCallback(async () => {
    if (busy || recording || simulator) return;
    if (hasLiveCamera) {
      if (!cameraReady) return;
      setBusy(true);
      setRecording(true);
      startRecordTicker();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const duration = mode === 'video60' ? 60 : 15;
        const uri = await liveCameraRef.current?.startRecording(duration);
        if (uri) {
          syncDraftOverlays();
          await beginCreateFromUri(uri, 'video');
        }
      } catch (e) {
        if (!holdRecording.current) {
          Alert.alert('บันทึกวิดีโอไม่ได้', e instanceof Error ? e.message : 'ลองอีกครั้ง');
        }
      } finally {
        holdRecording.current = false;
        setRecording(false);
        stopRecordTicker();
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    syncDraftOverlays();
    try {
      const captureMode = mode === 'video60' ? 'video60' : 'video15';
      await captureWithDeviceCamera(captureMode, facing);
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    cameraReady,
    facing,
    hasLiveCamera,
    mode,
    recording,
    simulator,
    startRecordTicker,
    stopRecordTicker,
    syncDraftOverlays,
  ]);

  const stopRecording = useCallback(() => {
    if (!recording || !hasLiveCamera) return;
    liveCameraRef.current?.stopRecording();
    stopRecordTicker();
  }, [hasLiveCamera, recording, stopRecordTicker]);

  const onShutterPress = useCallback(() => {
    if (longPressActive.current) return;
    if (mode === 'photo') {
      void runWithTimer(takePhoto);
      return;
    }
    if (!hasLiveCamera) {
      void runWithTimer(async () => {
        setBusy(true);
        syncDraftOverlays();
        try {
          await captureWithDeviceCamera(mode === 'video60' ? 'video60' : 'video15', facing);
        } finally {
          setBusy(false);
        }
      });
      return;
    }
    if (recording) stopRecording();
    else void startRecording();
  }, [
    facing,
    hasLiveCamera,
    mode,
    recording,
    runWithTimer,
    startRecording,
    stopRecording,
    syncDraftOverlays,
    takePhoto,
  ]);

  const onShutterPressIn = useCallback(() => {
    if (!hasLiveCamera) return;
    longPressActive.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressActive.current = true;
      holdRecording.current = true;
      if (!recording) void startRecording();
    }, 280);
  }, [hasLiveCamera, recording, startRecording]);

  const onShutterPressOut = useCallback(() => {
    if (!hasLiveCamera) return;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressActive.current && recording) {
      holdRecording.current = false;
      longPressActive.current = false;
      stopRecording();
    }
  }, [hasLiveCamera, recording, stopRecording]);

  const cycleFlash = useCallback(() => {
    void Haptics.selectionAsync();
    setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'));
  }, []);

  const cycleTimer = useCallback(() => {
    void Haptics.selectionAsync();
    setTimer((t) => {
      const idx = TIMER_OPTIONS.indexOf(t);
      return TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length];
    });
  }, []);

  const flipCamera = useCallback(() => {
    void Haptics.selectionAsync();
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, []);

  const openTextEditor = useCallback(() => {
    void Haptics.selectionAsync();
    setTextEditing(true);
  }, []);

  const musicLabel = draftMusic
    ? `${draftMusic}${draftMusicArtist ? ` · ${draftMusicArtist}` : ''}`
    : 'เพิ่มเสียง';

  const permissionDenied =
    !simulator &&
    ((hasLiveCamera && cameraPermissionGranted === false) ||
      (!hasLiveCamera && fallbackPermission != null && !fallbackPermission.granted));

  const showCameraLoading =
    !simulator &&
    !permissionDenied &&
    hasLiveCamera &&
    (cameraPermissionGranted !== true || !cameraReady);

  const showPermissionPrompt = permissionDenied;
  const showSimulatorPrompt = simulator;
  const showCameraFallbackHint =
    !simulator && !hasLiveCamera && !!cameraFallbackHint && !permissionDenied;

  return (
    <DragDownDismiss onDismiss={dismiss} enabled={!recording && !textEditing} style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.root}>
        <View style={styles.previewStage}>
          <View style={[styles.previewFrame, previewLayout]}>
            {hasLiveCamera && liveModule && !simulator ? (
              <liveModule.CreateCaptureLiveCamera
                ref={liveCameraRef}
                active={cameraActive}
                facing={facing}
                flash={flash}
                mode={mode}
                recording={recording}
                style={StyleSheet.absoluteFill}
                onReady={() => setCameraReady(true)}
                onMountError={(message) => Alert.alert('เปิดกล้องไม่ได้', message)}
                onPermissionChange={setCameraPermissionGranted}
              />
            ) : (
              <View style={styles.previewBackdrop} />
            )}

            {filterOverlay ? (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: filterOverlay }]}
              />
            ) : null}

            {(overlayText.trim() || textEditing) ? (
              <InteractiveTextOverlay
                editing={textEditing}
                text={overlayText}
                color={overlayColor}
                fontKey={overlayFont}
                transform={overlayTransform}
                onTextChange={setOverlayText}
                onColorChange={setOverlayColor}
                onFontChange={setOverlayFont}
                onTransformChange={setOverlayTransform}
                onEditingChange={setTextEditing}
              />
            ) : null}

            {countdown != null ? (
              <View style={styles.countdownOverlay} pointerEvents="none">
                <Text style={styles.countdownText}>{countdown}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {showCameraLoading ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}

        {showSimulatorPrompt ? (
          <View style={styles.promptOverlay} pointerEvents="box-none">
            <Text style={styles.promptText}>ซิมูเลเตอร์ไม่มีกล้อง — ใช้ปุ่มอัลบั้มด้านล่าง</Text>
          </View>
        ) : null}

        {showPermissionPrompt ? (
          <View style={styles.promptOverlay} pointerEvents="box-none">
            <Text style={styles.promptText}>ต้องการสิทธิ์กล้องเพื่อแสดงภาพสด</Text>
            <Pressable style={styles.permBtn} onPress={() => void requestFallbackCameraPermission()}>
              <Text style={styles.permBtnText}>อนุญาตกล้อง</Text>
            </Pressable>
          </View>
        ) : null}

        {showCameraFallbackHint ? (
          <View style={styles.fallbackHint} pointerEvents="none">
            <BlurView intensity={28} tint="dark" style={styles.fallbackHintBlur}>
              <Ionicons name="information-circle-outline" size={16} color="#fff" />
              <Text style={styles.fallbackHintText}>{cameraFallbackHint}</Text>
            </BlurView>
          </View>
        ) : null}

        {recording ? (
          <View style={[styles.recBadge, { top: insets.top + 56 }]} pointerEvents="none">
            <View style={styles.recDot} />
            <Text style={styles.recText}>
              {recordSec}s / {maxDuration}s
            </Text>
          </View>
        ) : null}

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={dismiss} hitSlop={12} style={styles.topIconBtn}>
            <BlurView intensity={28} tint="dark" style={styles.glassCircleSm}>
              <Ionicons name="close" size={24} color="#fff" />
            </BlurView>
          </Pressable>

          <Pressable
            style={styles.musicPill}
            onPress={() => {
              void Haptics.selectionAsync();
              if (!openListenScreenNow()) {
                Alert.alert('เพิ่มเสียง', 'เลือกเพลงจากโหมดฟังเพลงเป็นเสียงประกอบคลิป', [
                  { text: 'ตกลง', style: 'cancel' },
                ]);
              }
            }}
          >
            <BlurView intensity={36} tint="dark" style={styles.musicPillBlur}>
              <Ionicons name="musical-notes" size={14} color="#fff" />
              <Text style={styles.musicPillText} numberOfLines={1}>
                {musicLabel}
              </Text>
            </BlurView>
          </Pressable>

          <View style={styles.topSpacer} />
        </View>

        {/* Right vertical action bar */}
        <View
          style={[styles.rightRail, { top: insets.top + 88, bottom: insets.bottom + 200 }]}
          pointerEvents="box-none"
        >
          <GlassIconButton icon="camera-reverse-outline" label="พลิก" onPress={flipCamera} />
          {facing === 'back' ? (
            <GlassIconButton
              icon={flash === 'off' ? 'flash-off-outline' : flash === 'on' ? 'flash' : 'flash-outline'}
              label={flash === 'off' ? 'แฟลช' : flash === 'on' ? 'เปิด' : 'อัตโนมัติ'}
              active={flash !== 'off'}
              onPress={cycleFlash}
            />
          ) : null}
          <GlassIconButton
            icon="timer-outline"
            label={timer === 0 ? 'ตัวจับเวลา' : `${timer}s`}
            active={timer > 0}
            onPress={cycleTimer}
          />
          <GlassIconButton
            icon="color-filter-outline"
            label="ฟิลเตอร์"
            active={filter !== 'none'}
            onPress={() => {
              void Haptics.selectionAsync();
              setShowFilters((v) => !v);
            }}
          />
          <GlassIconButton icon="text" label="Aa" onPress={openTextEditor} size={20} />
        </View>

        {/* Filter strip */}
        {showFilters ? (
          <View style={[styles.filterStrip, { bottom: insets.bottom + 148 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  style={styles.filterChip}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setFilter(f.key);
                  }}
                >
                  <View style={[styles.filterSwatch, filter === f.key && styles.filterSwatchActive]}>
                    {f.overlay ? (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay, borderRadius: 8 }]} />
                    ) : null}
                  </View>
                  <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Bottom controls */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
          style={[styles.bottomGradient, { paddingBottom: insets.bottom + 10 }]}
          pointerEvents="box-none"
        >
          <View style={styles.bottomRow}>
            <Pressable
              style={styles.bottomSideBtn}
              onPress={() => {
                void Haptics.selectionAsync();
                setShowFilters(true);
              }}
            >
              <BlurView intensity={30} tint="dark" style={styles.effectsBtn}>
                <Ionicons name="sparkles" size={26} color="#fff" />
              </BlurView>
              <Text style={styles.bottomSideLabel}>เอฟเฟกต์</Text>
            </Pressable>

            <Pressable
              disabled={busy || !!countdown}
              onPress={onShutterPress}
              onPressIn={onShutterPressIn}
              onPressOut={onShutterPressOut}
              style={styles.shutterWrap}
              accessibilityLabel="ชัตเตอร์"
            >
              <View
                style={[
                  styles.shutterRing,
                  recording && styles.shutterRingRecording,
                  mode !== 'photo' && !recording && styles.shutterRingVideo,
                ]}
              >
                {busy && !recording ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View
                    style={[
                      styles.shutterCore,
                      recording && styles.shutterCoreRecording,
                      mode !== 'photo' && !recording && styles.shutterCoreVideo,
                    ]}
                  />
                )}
              </View>
            </Pressable>

            <Pressable
              style={styles.bottomSideBtn}
              onPress={() => void openGallery()}
              disabled={pickingGallery}
            >
              <View style={styles.albumFrame}>
                {latestThumb ? (
                  <Image source={{ uri: latestThumb }} style={styles.albumThumb} />
                ) : (
                  <BlurView intensity={24} tint="dark" style={styles.albumPlaceholder}>
                    <Ionicons name="images-outline" size={20} color="#fff" />
                  </BlurView>
                )}
              </View>
              <Text style={styles.bottomSideLabel}>อัลบั้ม</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modeRow}
          >
            {MODES.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => {
                  if (recording) return;
                  void Haptics.selectionAsync();
                  setMode(m.key);
                }}
                style={styles.modeChip}
              >
                <Text style={[styles.modeText, mode === m.key && styles.modeTextActive]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </LinearGradient>
      </View>
    </DragDownDismiss>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  previewStage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  previewFrame: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  promptOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  promptText: {
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  permBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fallbackHint: {
    position: 'absolute',
    top: 96,
    left: 16,
    right: 16,
    zIndex: 4,
    alignItems: 'center',
  },
  fallbackHintBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
    maxWidth: 340,
  },
  fallbackHintText: {
    flex: 1,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 8,
  },
  countdownText: {
    color: '#fff',
    fontSize: 88,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  recBadge: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 6,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff3040' },
  recText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    zIndex: 5,
  },
  topIconBtn: { width: 44 },
  topSpacer: { width: 44 },
  glassCircleSm: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  musicPill: { flex: 1, marginHorizontal: 8 },
  musicPillBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  musicPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 220,
  },
  rightRail: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 5,
  },
  sideBtnWrap: { alignItems: 'center', gap: 4 },
  glassCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  glassCircleActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  sideBtnLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 56,
  },
  filterStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 4,
  },
  filterRow: { paddingHorizontal: 12, gap: 10 },
  filterChip: { alignItems: 'center', gap: 4, width: 58 },
  filterSwatch: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterSwatchActive: { borderColor: '#fff' },
  filterLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600' },
  filterLabelActive: { color: '#fff', fontWeight: '800' },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 40,
    zIndex: 5,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  bottomSideBtn: { alignItems: 'center', width: 72, gap: 6 },
  bottomSideLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700' },
  effectsBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  shutterWrap: { alignItems: 'center', justifyContent: 'center' },
  shutterRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  shutterRingVideo: { borderColor: 'rgba(255,255,255,0.95)' },
  shutterRingRecording: { borderColor: '#ff3040' },
  shutterCore: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#fff',
  },
  shutterCoreVideo: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#ff3040',
  },
  shutterCoreRecording: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#ff3040',
  },
  albumFrame: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  albumThumb: { width: '100%', height: '100%' },
  albumPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  modeRow: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 20,
  },
  modeChip: { paddingVertical: 6, paddingHorizontal: 4 },
  modeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '700',
  },
  modeTextActive: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
