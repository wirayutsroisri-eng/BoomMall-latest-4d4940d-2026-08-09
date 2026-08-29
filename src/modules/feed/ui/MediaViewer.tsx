import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, Share, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import Slider from '@react-native-community/slider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useFeedMediaViewerStore, type MediaViewerItem } from '../state/feed-media-viewer-store';
import { MediaViewerGestureLayer } from './MediaViewerGestureLayer';
import { type StickerOverlayObject, type TextOverlayObject } from '@/modules/create/domain/editorComposition';
import { TextOverlayRenderer } from '@/modules/create/ui/TextOverlayRenderer';
import { LockedStickerOverlay } from '@/modules/create/ui/LockedStickerOverlay';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { CommentsBottomSheet } from '@/modules/feed/ui/CommentsBottomSheet';
import { Avatar } from '@/shared/components/Avatar';

const { width: W, height: H } = Dimensions.get('window');

function frame(item: MediaViewerItem) {
  const maxH = H * 0.82;
  if (!item.width || !item.height) return { width: W, height: maxH };
  const ratio = item.width / item.height;
  const h = Math.min(maxH, W / ratio);
  return { width: Math.min(W, h * ratio), height: h };
}
function clock(value: number) {
  const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

const MediaVideoPlayer = memo(function MediaVideoPlayer({ item, active }: { item: MediaViewerItem; active: boolean }) {
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(item.initialTime ?? 0);
  const player = useVideoPlayer({ uri: item.uri, useCaching: true }, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.2;
    if (item.initialTime) p.currentTime = item.initialTime;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const safePause = useCallback(() => {
    try { if (player.playing) player.pause(); } catch { /* useVideoPlayer may already have released native state */ }
  }, [player]);
  const safePlay = useCallback(() => {
    try { player.play(); } catch { /* closing/unmount race */ }
  }, [player]);
  useEffect(() => {
    if (active) safePlay(); else safePause();
    // useVideoPlayer owns release/pause during unmount. Calling pause from a
    // passive cleanup races the native shared-object disposal on iOS.
  }, [active, safePause, safePlay]);
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime: value }) => setCurrentTime(value));
    return () => sub.remove();
  }, [player]);
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  return <View style={styles.video}>
    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} surfaceType="textureView" onFirstFrameRender={() => setReady(true)} />
    {item.posterUri && !ready ? <Image source={{ uri: item.posterUri }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
    <Pressable style={styles.videoTap} onPress={() => player.playing ? safePause() : safePlay()}>
      {!isPlaying ? <View style={styles.play}><Ionicons name="play" size={34} color="#fff" /></View> : null}
    </Pressable>
    <View style={styles.controls}>
      <Pressable style={styles.control} onPress={() => { const next = !muted; setMuted(next); player.muted = next; }}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={21} color="#fff" />
      </Pressable>
      <Text style={styles.time}>{clock(currentTime)}</Text>
      <Slider style={styles.slider} minimumValue={0} maximumValue={Math.max(1, duration)} value={Math.min(currentTime, duration || 0)} minimumTrackTintColor="#fff" maximumTrackTintColor="#777" thumbTintColor="#fff" onSlidingStart={safePause} onSlidingComplete={(v) => { try { player.currentTime = v; safePlay(); } catch { /* viewer closed during seek */ } }} />
      <Text style={styles.time}>{clock(duration)}</Text>
    </View>
  </View>;
});

export const MediaViewer = memo(function MediaViewer() {
  const visible = useFeedMediaViewerStore((s) => s.visible);
  const items = useFeedMediaViewerStore((s) => s.items);
  const initialIndex = useFeedMediaViewerStore((s) => s.initialIndex);
  const mediaIds = useFeedMediaViewerStore((s) => s.mediaIds);
  const overlays = useFeedMediaViewerStore((s) => s.overlays);
  const media = useFeedMediaViewerStore((s) => s.media);
  const close = useFeedMediaViewerStore((s) => s.close);
  const feedItems = useFeedStore((s) => s.items);
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<MediaViewerItem>>(null);
  const commentsRef = useRef<BottomSheetModal>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const dismissY = useSharedValue(0);
  const enter = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex); setZoomed(false); dismissY.value = 0; enter.value = 0;
    enter.value = withSpring(1, { damping: 24, stiffness: 260 });
    requestAnimationFrame(() => list.current?.scrollToIndex({ index: initialIndex, animated: false }));
  }, [dismissY, enter, initialIndex, visible]);
  useEffect(() => {
    if (!visible) return;
    for (const item of [items[index - 1], items[index + 1]]) if (item?.type === 'image') void Image.prefetch(item.uri);
  }, [index, items, visible]);
  const settle = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / W)), []);
  const backdrop = useAnimatedStyle(() => ({ opacity: enter.value * 0.72 * interpolate(dismissY.value, [0, H * 0.55], [1, 0], 'clamp') }));
  const content = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: dismissY.value }, { scale: interpolate(enter.value, [0, 1], [0.92, 1]) * interpolate(dismissY.value, [0, H * 0.6], [1, 0.78], 'clamp') }] }));
  if (!visible || !items.length) return null;
  const activeItem = items[index];
  const activePostId = activeItem?.sourcePostId;
  const livePost = feedItems.find((item) => item.id === activePostId);
  return <GestureHandlerRootView style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close}><Animated.View pointerEvents="none" style={[styles.backdrop, backdrop]} /></Pressable>
      <Animated.View style={[styles.pager, content]} pointerEvents="box-none">
        <FlatList ref={list} data={items} horizontal pagingEnabled scrollEnabled={!zoomed} showsHorizontalScrollIndicator={false} initialScrollIndex={initialIndex} initialNumToRender={1} maxToRenderPerBatch={1} windowSize={3} removeClippedSubviews keyExtractor={(item) => item.id} getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })} onMomentumScrollEnd={settle} renderItem={({ item, index: i }) => {
          const mediaId = mediaIds[i];
          const texts = overlays.filter((o): o is TextOverlayObject => o.type === 'text' && o.mediaId === mediaId);
          const sticker = overlays.find((o): o is StickerOverlayObject => o.type === 'sticker' && o.mediaId === mediaId);
          return <Pressable style={styles.page} onPress={close}><View style={frame(item)}><MediaViewerGestureLayer active={i === index} resetKey={`${visible}:${i === index ? index : 'idle'}`} dismissY={dismissY} onDismiss={close} onZoomChange={item.type === 'image' ? setZoomed : () => undefined} zoomEnabled={item.type === 'image'}>{item.type === 'video' ? <MediaVideoPlayer item={item} active={i === index} /> : <><Image source={{ uri: item.uri }} style={styles.image} resizeMode="contain" />{texts.length ? <TextOverlayRenderer overlays={texts} sourceSize={media[i]?.width && media[i]?.height ? { width: media[i]!.width!, height: media[i]!.height! } : undefined} contentFit="contain" /> : null}{sticker ? <LockedStickerOverlay sticker={sticker.sticker} transform={sticker.transform} /> : null}</>}</MediaViewerGestureLayer></View></Pressable>;
        }} />
      </Animated.View>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none"><View style={styles.close} /><Text style={styles.counter}>{index + 1} / {items.length}</Text><Pressable style={styles.close} onPress={close} accessibilityLabel="ปิด"><Ionicons name="close" size={29} color="#fff" /></Pressable></View>
      {activeItem?.type === 'video' && activePostId ? <>
        <View style={[styles.sideActions, { bottom: 116 + insets.bottom }]}>
          <Pressable style={styles.sideAction} onPress={() => useFeedStore.getState().toggleLike(activePostId)}><Ionicons name={livePost?.liked ? 'heart' : 'heart-outline'} size={34} color={livePost?.liked ? '#EF315A' : '#fff'} /><Text style={styles.actionText}>{livePost?.likes ?? activeItem.likes ?? 0}</Text></Pressable>
          <Pressable style={styles.sideAction} onPress={() => { useFeedStore.getState().openComments(activePostId); requestAnimationFrame(() => commentsRef.current?.present()); }}><Ionicons name="chatbubble-outline" size={33} color="#fff" /><Text style={styles.actionText}>{livePost?.comments ?? activeItem.comments ?? 0}</Text></Pressable>
          <Pressable style={styles.sideAction} onPress={() => void Share.share({ message: livePost?.caption || activeItem.uri })}><Ionicons name="arrow-redo-outline" size={34} color="#fff" /><Text style={styles.actionText}>{livePost?.shares ?? activeItem.shares ?? 0}</Text></Pressable>
          <Pressable style={styles.sideAction} onPress={() => useFeedStore.getState().toggleSave(activePostId)}><Ionicons name={livePost?.saved ? 'bookmark' : 'bookmark-outline'} size={34} color="#fff" /></Pressable>
        </View>
        <View style={[styles.meta, { bottom: 94 + insets.bottom }]} pointerEvents="box-none">
          <View style={styles.authorRow}><Avatar uri={activeItem.avatarUri} initial={(activeItem.author || 'B').slice(0, 1)} size={40} radius={20} /><View style={{ flex: 1 }}><Text style={styles.author} numberOfLines={1}>{activeItem.author || activeItem.authorHandle || 'BoomMall'}</Text><Text style={styles.date}>วันนี้</Text></View></View>
          {activeItem.caption ? <Text style={styles.caption} numberOfLines={2}>{activeItem.caption}</Text> : null}
        </View>
        <Pressable style={[styles.composer, { bottom: Math.max(insets.bottom, 8) }]} onPress={() => { useFeedStore.getState().openComments(activePostId); requestAnimationFrame(() => commentsRef.current?.present()); }}>
          <Text style={styles.composerText}>แสดงความคิดเห็น</Text><Ionicons name="happy-outline" size={27} color="#fff" /><Text style={styles.gif}>GIF</Text>
        </Pressable>
      </> : null}
      <CommentsBottomSheet ref={commentsRef} feedId={activePostId ?? null} commentCount={livePost?.comments ?? activeItem?.comments ?? 0} />
    </GestureHandlerRootView>;
});

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 1000 }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000' }, pager: { flex: 1 }, page: { width: W, height: H, alignItems: 'center', justifyContent: 'center' }, image: { width: '100%', height: '100%' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10 }, close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, counter: { color: '#fff', fontSize: 15, fontWeight: '800' },
  video: { flex: 1, backgroundColor: '#000' }, videoTap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }, play: { width: 68, height: 68, borderRadius: 34, paddingLeft: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.5)' }, controls: { position: 'absolute', left: 10, right: 10, bottom: 10, height: 42, borderRadius: 10, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,.42)' }, control: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' }, slider: { flex: 1, height: 38 }, time: { minWidth: 38, color: '#fff', fontSize: 11, textAlign: 'center' },
  sideActions: { position: 'absolute', right: 12, alignItems: 'center', gap: 22 }, sideAction: { width: 52, alignItems: 'center', gap: 3 }, actionText: { color: '#fff', fontSize: 13, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 3 },
  meta: { position: 'absolute', left: 16, right: 78, gap: 9 }, authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, author: { color: '#fff', fontSize: 16, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 }, date: { color: 'rgba(255,255,255,.82)', fontSize: 12, marginTop: 2 }, caption: { color: '#fff', fontSize: 15, lineHeight: 20, textShadowColor: '#000', textShadowRadius: 4 },
  composer: { position: 'absolute', left: 14, right: 14, height: 54, borderRadius: 27, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(25,25,25,.92)' }, composerText: { flex: 1, color: 'rgba(255,255,255,.72)', fontSize: 15 }, gif: { color: '#fff', fontSize: 11, fontWeight: '900', borderWidth: 1.5, borderColor: '#fff', borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 },
});
