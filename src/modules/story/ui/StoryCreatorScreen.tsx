import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet as NativeStyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { uploadMediaAsset } from '@/modules/media/data/mediaAssetApi';
import { generateVideoThumbnail } from '@/shared/media/videoThumbnails';
import { loadLiveCameraModule } from '@/modules/create/data/createCaptureCameraBridge';
import type { LiveCameraHandle } from '@/modules/create/ui/CreateCaptureLiveCamera';
import { useStoryStore } from '../state/story-store';
import type { StoryMediaType, StoryOverlay } from '../domain/types';

const StyleSheet = { ...NativeStyleSheet, absoluteFillObject: NativeStyleSheet.absoluteFill };

const COLORS = ['#FFFFFF', '#FFD60A', '#38DDA4', '#FF375F', '#64D2FF'];

type SelectedStoryMedia = {
  uri: string;
  type: StoryMediaType;
  width?: number;
  height?: number;
  duration?: number | null;
  mimeType?: string | null;
};

function StoryVideo({ uri, contentFit }: { uri: string; contentFit: 'contain' | 'cover' }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = true; instance.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={contentFit} nativeControls />;
}

function MovableText({ overlay, onChange }: { overlay: StoryOverlay; onChange: (next: StoryOverlay) => void }) {
  const x = useSharedValue(overlay.x);
  const y = useSharedValue(overlay.y);
  const scale = useSharedValue(overlay.scale);
  const rotation = useSharedValue(overlay.rotation);
  const startX = useSharedValue(0); const startY = useSharedValue(0); const startScale = useSharedValue(1); const startRotation = useSharedValue(0);
  const commit = () => onChange({ ...overlay, x: x.value, y: y.value, scale: scale.value, rotation: rotation.value });
  const pan = Gesture.Pan().onStart(() => { startX.value = x.value; startY.value = y.value; }).onUpdate((event) => { x.value = startX.value + event.translationX; y.value = startY.value + event.translationY; }).onEnd(() => runOnJS(commit)());
  const pinch = Gesture.Pinch().onStart(() => { startScale.value = scale.value; }).onUpdate((event) => { scale.value = Math.max(0.5, Math.min(3, startScale.value * event.scale)); }).onEnd(() => runOnJS(commit)());
  const rotate = Gesture.Rotation().onStart(() => { startRotation.value = rotation.value; }).onUpdate((event) => { rotation.value = startRotation.value + event.rotation; }).onEnd(() => runOnJS(commit)());
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }, { rotate: `${rotation.value}rad` }] }));
  return <GestureDetector gesture={Gesture.Simultaneous(pan, pinch, rotate)}><Animated.View style={[styles.overlay, style]}><Text style={{ color: overlay.color, fontSize: overlay.fontSize, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 5 }}>{overlay.value}</Text></Animated.View></GestureDetector>;
}

export function StoryCreatorScreen() {
  const insets = useSafeAreaInsets();
  const create = useStoryStore((state) => state.create);
  const refresh = useStoryStore((state) => state.refresh);
  const liveCameraRef = useRef<LiveCameraHandle>(null);
  const liveModule = useMemo(() => loadLiveCameraModule(), []);
  const [asset, setAsset] = useState<SelectedStoryMedia | null>(null);
  const [overlay, setOverlay] = useState<StoryOverlay | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [text, setText] = useState('');
  const [colorIndex, setColorIndex] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [contentFit, setContentFit] = useState<'contain' | 'cover'>('cover');
  const [captureMode, setCaptureMode] = useState<StoryMediaType>('image');
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraGranted, setCameraGranted] = useState<boolean | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const dismiss = useCallback(() => {
    if (recording) liveCameraRef.current?.stopRecording();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [recording]);

  const resetDraft = useCallback(() => {
    setAsset(null);
    setOverlay(null);
    setEditingText(false);
    setText('');
    setColorIndex(0);
    setContentFit('cover');
  }, []);

  const pickLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('ต้องการสิทธิ์', 'กรุณาอนุญาตการเข้าถึงคลังรูป'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1, selectionLimit: 1 });
    if (!result.canceled && result.assets[0]) {
      const selected = result.assets[0];
      setOverlay(null);
      setEditingText(false);
      setText('');
      setContentFit('cover');
      setAsset({ ...selected, type: selected.type === 'video' ? 'video' : 'image' });
    }
  }, []);

  const useCapturedMedia = useCallback((uri: string, type: StoryMediaType) => {
    setOverlay(null);
    setEditingText(false);
    setText('');
    setContentFit('cover');
    if (type === 'image') {
      Image.getSize(uri, (width, height) => setAsset({ uri, type, width, height }), () => setAsset({ uri, type }));
    } else {
      setAsset({ uri, type });
    }
  }, []);

  const openSystemCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert('ต้องการสิทธิ์', 'กรุณาอนุญาตการใช้กล้อง'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 1, videoMaxDuration: 60 });
    if (!result.canceled && result.assets[0]) {
      const selected = result.assets[0];
      setAsset({ ...selected, type: selected.type === 'video' ? 'video' : 'image' });
    }
  }, []);

  const capture = useCallback(async () => {
    if (recording) {
      liveCameraRef.current?.stopRecording();
      return;
    }
    if (capturing) return;
    if (!liveModule) { await openSystemCamera(); return; }
    if (!cameraGranted || !cameraReady) return;
    setCapturing(true);
    try {
      if (captureMode === 'image') {
        const uri = await liveCameraRef.current?.takePhoto();
        if (uri) useCapturedMedia(uri, 'image');
      } else {
        setRecording(true);
        const uri = await liveCameraRef.current?.startRecording(60);
        if (uri) useCapturedMedia(uri, 'video');
      }
    } finally {
      setRecording(false);
      setCapturing(false);
    }
  }, [cameraGranted, cameraReady, captureMode, capturing, liveModule, openSystemCamera, recording, useCapturedMedia]);

  const addText = () => {
    const value = text.trim();
    if (!value) return;
    setOverlay({ id: `story-text-${Date.now()}`, type: 'text', value, color: COLORS[colorIndex], fontSize: 30, x: 0, y: 0, scale: 1, rotation: 0 });
    setEditingText(false);
  };

  const share = async () => {
    if (!asset || publishing) return;
    setPublishing(true);
    try {
      const type: StoryMediaType = asset.type;
      const uploaded = await uploadMediaAsset({ uri: asset.uri, type, width: asset.width, height: asset.height, duration: asset.duration != null ? asset.duration / 1000 : undefined, mimeType: asset.mimeType ?? undefined });
      let thumbnailAssetId: string | undefined;
      if (type === 'video') {
        const thumbnailUri = await generateVideoThumbnail(asset.uri);
        if (thumbnailUri) {
          const thumbnail = await uploadMediaAsset({ uri: thumbnailUri, type: 'image', mimeType: 'image/jpeg' });
          thumbnailAssetId = thumbnail.id;
        }
      }
      await create({ mediaAssetId: uploaded.id, thumbnailAssetId, overlayJson: overlay ? [overlay] : [] });
      resetDraft();
      await refresh().catch(() => undefined);
      dismiss();
    } catch (error) {
      Alert.alert('แชร์ Story ไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองใหม่');
    } finally { setPublishing(false); }
  };

  return <DragDownDismiss onDismiss={dismiss} enabled={!publishing && !editingText} style={styles.root}>
    {!asset ? <View style={styles.cameraScreen}>
      {liveModule ? <liveModule.CreateCaptureLiveCamera
        ref={liveCameraRef}
        active={!asset}
        facing={cameraFacing}
        flash="off"
        mode={captureMode === 'image' ? 'photo' : 'video60'}
        recording={recording}
        style={StyleSheet.absoluteFill}
        onReady={() => setCameraReady(true)}
        onMountError={(message) => Alert.alert('เปิดกล้องไม่ได้', message)}
        onPermissionChange={setCameraGranted}
      /> : <View style={styles.cameraFallback} />}
      <View style={[styles.cameraTop, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.roundControl} onPress={dismiss} hitSlop={12}><Ionicons name="close" size={28} color="#fff" /></Pressable>
        <Text style={styles.title}>Story</Text>
        <Pressable style={styles.roundControl} onPress={() => setCameraFacing((value) => value === 'back' ? 'front' : 'back')} hitSlop={8}><Ionicons name="camera-reverse-outline" size={25} color="#fff" /></Pressable>
      </View>
      {!liveModule ? <Pressable style={styles.systemCameraButton} onPress={() => void openSystemCamera()}><Ionicons name="camera" size={24} color="#fff" /><Text style={styles.systemCameraText}>เปิดกล้อง</Text></Pressable> : null}
      <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.modeSelector}>
          <Pressable onPress={() => !recording && setCaptureMode('image')}><Text style={[styles.modeText, captureMode === 'image' && styles.modeTextActive]}>รูปภาพ</Text></Pressable>
          <Pressable onPress={() => !recording && setCaptureMode('video')}><Text style={[styles.modeText, captureMode === 'video' && styles.modeTextActive]}>วิดีโอ</Text></Pressable>
        </View>
        <View style={styles.captureRow}>
          <Pressable style={styles.galleryButton} onPress={() => void pickLibrary()} disabled={capturing || recording}><Ionicons name="images" size={27} color="#fff" /></Pressable>
          <Pressable style={styles.shutter} onPress={() => void capture()} disabled={capturing && !recording} accessibilityLabel={recording ? 'หยุดถ่ายวิดีโอ' : captureMode === 'video' ? 'ถ่ายวิดีโอ' : 'ถ่ายรูป'}>
            <View style={[styles.shutterCore, captureMode === 'video' && styles.videoCore, recording && styles.recordingCore]} />
          </Pressable>
          <View style={styles.captureSpacer} />
        </View>
      </View>
    </View> : <View style={styles.editor}>
      <View style={styles.mediaLayer}>
        {asset.type === 'video'
          ? <StoryVideo uri={asset.uri} contentFit={contentFit} />
          : <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode={contentFit} />}
      </View>
      {overlay ? <MovableText overlay={overlay} onChange={setOverlay} /> : null}
      <View style={[styles.editorHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.roundControl} onPress={dismiss} hitSlop={12}><Ionicons name="close" size={28} color="#fff" /></Pressable>
        <Text style={styles.title}>Story</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.tools}>
        <Pressable style={styles.tool} onPress={() => { setText(overlay?.value ?? ''); setEditingText(true); }}><Ionicons name="text" size={24} color="#fff" /><Text style={styles.toolText}>ข้อความ</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => setContentFit((value) => value === 'cover' ? 'contain' : 'cover')}><Ionicons name={contentFit === 'cover' ? 'scan' : 'expand'} size={24} color="#fff" /><Text style={styles.toolText}>{contentFit === 'cover' ? 'พอดีจอ' : 'เต็มจอ'}</Text></Pressable>
        <Pressable style={styles.tool} onPress={() => void pickLibrary()}><Ionicons name="images" size={24} color="#fff" /><Text style={styles.toolText}>เปลี่ยนสื่อ</Text></Pressable>
      </View>
      <Pressable style={[styles.share, { bottom: insets.bottom + 18 }]} onPress={() => void share()} disabled={publishing}>{publishing ? <ActivityIndicator color="#05100C" /> : <Text style={styles.shareText}>แชร์ไปยัง Story</Text>}</Pressable>
    </View>}
    {editingText ? <View style={styles.textEditor}>
      <TextInput autoFocus value={text} onChangeText={setText} placeholder="พิมพ์ข้อความ" placeholderTextColor="#aaa" style={[styles.textInput, { color: COLORS[colorIndex] }]} maxLength={120} />
      <Pressable style={[styles.colorDot, { backgroundColor: COLORS[colorIndex] }]} onPress={() => setColorIndex((value) => (value + 1) % COLORS.length)} />
      <Pressable style={styles.done} onPress={addText}><Text style={styles.doneText}>เสร็จ</Text></Pressable>
    </View> : null}
  </DragDownDismiss>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050806' }, title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  cameraScreen: { flex: 1, backgroundColor: '#000' }, cameraFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: '#050806' }, cameraTop: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 88, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, cameraBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 24, backgroundColor: 'rgba(0,0,0,0.28)' }, modeSelector: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginBottom: 16 }, modeText: { color: 'rgba(255,255,255,0.68)', fontSize: 14, fontWeight: '800' }, modeTextActive: { color: '#fff' }, captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 28 }, galleryButton: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.56)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' }, shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, shutterCore: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' }, videoCore: { backgroundColor: '#F33A47' }, recordingCore: { width: 30, height: 30, borderRadius: 7 }, captureSpacer: { width: 52, height: 52 }, systemCameraButton: { position: 'absolute', alignSelf: 'center', top: '46%', height: 48, paddingHorizontal: 18, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.18)' }, systemCameraText: { color: '#fff', fontWeight: '900' },
  editor: { flex: 1, backgroundColor: '#000', overflow: 'hidden' }, mediaLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }, editorHeader: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 88, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, roundControl: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.46)', alignItems: 'center', justifyContent: 'center' }, tools: { position: 'absolute', top: 108, right: 14, gap: 12 }, tool: { width: 64, alignItems: 'center', gap: 3, padding: 8, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)' }, toolText: { color: '#fff', fontSize: 10, fontWeight: '800' }, overlay: { position: 'absolute', alignSelf: 'center', top: '43%', padding: 8 },
  share: { position: 'absolute', right: 18, paddingHorizontal: 22, height: 48, borderRadius: 24, backgroundColor: '#38DDA4', alignItems: 'center', justifyContent: 'center' }, shareText: { color: '#04100B', fontWeight: '900', fontSize: 15 },
  textEditor: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 22, gap: 10 }, textInput: { flex: 1, fontSize: 28, fontWeight: '900', textAlign: 'center', borderBottomWidth: 2, borderBottomColor: '#fff', padding: 10 }, colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff' }, done: { paddingHorizontal: 15, height: 42, borderRadius: 21, backgroundColor: '#38DDA4', justifyContent: 'center' }, doneText: { fontWeight: '900', color: '#04100B' },
});
