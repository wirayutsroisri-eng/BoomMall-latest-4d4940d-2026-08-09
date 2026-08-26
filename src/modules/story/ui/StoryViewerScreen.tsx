import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet as NativeStyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/shared/components/Avatar';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { useStoryStore } from '../state/story-store';
import { storyContentOverlays, type Story } from '../domain/types';

const StyleSheet = { ...NativeStyleSheet, absoluteFillObject: NativeStyleSheet.absoluteFill };

const IMAGE_MS = 5000;

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes || 1} นาที` : `${Math.floor(minutes / 60)} ชม.`;
}

function StoryVideo({ story, paused, onProgress, onDone }: { story: Story; paused: boolean; onProgress: (value: number) => void; onDone: () => void }) {
  const player = useVideoPlayer(story.mediaUrl, (instance) => {
    try { instance.play(); } catch { /* Fast Refresh may already have released it. */ }
  });
  useEffect(() => {
    try {
      if (paused) player.pause(); else player.play();
    } catch {
      // expo-video owns disposal; ignore a command racing native release.
    }
  }, [paused, player]);
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const duration = player.duration || 0;
        if (duration > 0) {
          const value = Math.min(1, player.currentTime / duration);
          onProgress(value);
          if (value >= 0.995) onDone();
        }
      } catch { /* Player was released while the timer was being cleared. */ }
    }, 100);
    return () => clearInterval(timer);
  }, [onDone, onProgress, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

export function StoryViewerScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ storyId?: string }>();
  const stories = useStoryStore((state) => state.stories);
  const refresh = useStoryStore((state) => state.refresh);
  const markViewed = useStoryStore((state) => state.markViewed);
  const [currentStoryId, setCurrentStoryId] = useState(() => params.storyId ?? stories[0]?.id ?? '');
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const pressStarted = useRef(0);
  const story = stories.find((item) => item.id === currentStoryId);
  const userStories = useMemo(
    () => story ? stories.filter((item) => item.userId === story.userId) : [],
    [stories, story],
  );
  const userIndex = story ? userStories.findIndex((item) => item.id === story.id) : -1;
  const dismiss = useCallback(() => router.canGoBack() ? router.back() : router.replace('/(tabs)'), []);
  const next = useCallback(() => {
    setProgress(0);
    if (userIndex >= 0 && userIndex < userStories.length - 1) setCurrentStoryId(userStories[userIndex + 1]!.id);
    else dismiss();
  }, [dismiss, userIndex, userStories]);
  const previous = useCallback(() => {
    setProgress(0);
    if (userIndex > 0) setCurrentStoryId(userStories[userIndex - 1]!.id);
  }, [userIndex, userStories]);

  useEffect(() => { if (!stories.length) void refresh(); }, [refresh, stories.length]);
  useEffect(() => {
    if (!currentStoryId && stories[0]) setCurrentStoryId(stories[0].id);
  }, [currentStoryId, stories]);
  useEffect(() => { if (story?.id) void markViewed(story.id).catch(() => undefined); }, [markViewed, story?.id]);
  useEffect(() => {
    if (!story || story.mediaType === 'video' || paused) return;
    const started = Date.now() - progress * IMAGE_MS;
    const timer = setInterval(() => {
      const value = Math.min(1, (Date.now() - started) / IMAGE_MS);
      setProgress(value);
      if (value >= 1) next();
    }, 80);
    return () => clearInterval(timer);
  }, [next, paused, progress, story]);

  if (!story) return <View style={styles.root} />;
  const name = story.user?.displayName || story.user?.handle || 'ผู้ใช้ BoomMall';
  return <DragDownDismiss onDismiss={dismiss} style={styles.root}>
    <View style={styles.media}>
      {story.mediaType === 'video'
        ? <StoryVideo story={story} paused={paused} onProgress={setProgress} onDone={next} />
        : <Image source={{ uri: story.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      {storyContentOverlays(story.overlayJson).map((overlay) => <Text key={overlay.id} style={[styles.overlay, { color: overlay.color, fontSize: overlay.fontSize, transform: [{ translateX: overlay.x }, { translateY: overlay.y }, { scale: overlay.scale }, { rotate: `${overlay.rotation}rad` }] }]}>{overlay.value}</Text>)}
    </View>
    <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
      <View style={styles.progressRow}>{userStories.map((item, itemIndex) => <View key={item.id} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${itemIndex < userIndex ? 100 : itemIndex === userIndex ? progress * 100 : 0}%` }]} /></View>)}</View>
      <View style={styles.author}><Avatar uri={story.user?.avatarUrl} initial={name[0]} size={34} /><Text style={styles.name}>{name}</Text><Text style={styles.time}>{relativeTime(story.createdAt)}</Text></View>
    </View>
    <Pressable style={StyleSheet.absoluteFill} onPressIn={() => { pressStarted.current = Date.now(); setPaused(true); }} onPressOut={(event) => {
      setPaused(false);
      if (Date.now() - pressStarted.current < 250) {
        if (event.nativeEvent.locationX < width * 0.35) previous(); else next();
      }
    }} />
  </DragDownDismiss>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' }, media: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }, top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10, gap: 10, zIndex: 2 }, progressRow: { flexDirection: 'row', gap: 4 }, progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.32)', overflow: 'hidden' }, progressFill: { height: '100%', backgroundColor: '#fff' }, author: { flexDirection: 'row', alignItems: 'center', gap: 8 }, name: { color: '#fff', fontWeight: '900', fontSize: 14 }, time: { color: 'rgba(255,255,255,0.7)', fontSize: 12 }, overlay: { position: 'absolute', top: '43%', alignSelf: 'center', fontWeight: '900', textShadowColor: '#000', textShadowRadius: 5 },
});
