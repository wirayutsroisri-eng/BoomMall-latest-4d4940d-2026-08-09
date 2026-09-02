import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { HomeFeedScreen } from './HomeFeedScreen';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ENTER_MS = 260;
const enterEasing = Easing.out(Easing.cubic);

export function VideoFeedScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const swipeX = useSharedValue(0);
  /** ระยะลากลงจาก DragDownDismiss — ใช้จางพื้นดำให้เห็นฟีดข้างหลัง */
  const dragY = useSharedValue(0);
  const closing = useSharedValue(false);
  /** 0→1 หลัง mount — ขยายกรอบโปสเตอร์ ไม่ scale VideoView (พื้นผิววิดีโอไม่ตาม transform) */
  const enter = useSharedValue(0);
  const [heroCover, setHeroCover] = useState(true);
  const { feedId, startTime, ox, oy, ow, oh } = useLocalSearchParams<{
    feedId?: string;
    startTime?: string;
    ox?: string;
    oy?: string;
    ow?: string;
    oh?: string;
  }>();
  const initialPlaybackTime = Number.isFinite(Number(startTime)) ? Math.max(0, Number(startTime)) : 0;

  // Hero: ตำแหน่งวิดีโอในฟีด — หน้าคลิปขยายจากจุดนี้เป็นเต็มจอ (แบบ Facebook)
  const originW = Number(ow);
  const originH = Number(oh);
  const hasHero = Number.isFinite(Number(ox)) && Number.isFinite(Number(oy)) && originW > 0 && originH > 0;
  const originX = hasHero ? Number(ox) : 0;
  const originY = hasHero ? Number(oy) : 0;
  const posterUri = useFeedStore((s) => {
    if (!feedId) return undefined;
    const item = s.items.find((entry) => entry.id === feedId);
    return item?.mediaAssets?.find((asset) => asset.type === 'video')?.thumbnailUrl;
  });

  const dropHeroCover = useCallback(() => setHeroCover(false), []);

  useEffect(() => {
    setHeroCover(true);
    enter.value = 0;
    const id = requestAnimationFrame(() => {
      enter.value = withTiming(1, { duration: ENTER_MS, easing: enterEasing }, (finished) => {
        if (finished) runOnJS(dropHeroCover)();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [dropHeroCover, enter]);

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  const closeToRight = useCallback(() => {
    if (closing.value) return;
    closing.value = true;
    swipeX.value = withTiming(
      SCREEN_WIDTH,
      { duration: 240, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(dismiss)();
      },
    );
  }, [closing, dismiss, swipeX]);

  const swipeBackGesture = Gesture.Pan()
    .cancelsTouchesInView(false)
    .activeOffsetX(12)
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      if (closing.value || event.translationX < 0) return;
      swipeX.value = event.translationX;
    })
    .onEnd((event) => {
      if (swipeX.value > 90 || event.velocityX > 800) {
        closing.value = true;
        swipeX.value = withTiming(
          SCREEN_WIDTH,
          { duration: 220, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(dismiss)();
          },
        );
      } else {
        swipeX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
    });

  const swipeStyle = useAnimatedStyle(() => {
    if (swipeX.value === 0) return {};
    return {
      opacity: interpolate(swipeX.value, [0, SCREEN_WIDTH], [1, 0.88], 'clamp'),
      transform: [
        { translateX: swipeX.value },
        { scale: interpolate(swipeX.value, [0, SCREEN_WIDTH], [1, 0.96], 'clamp') },
      ],
    };
  });

  /** กรอบโปสเตอร์ขยายจากตำแหน่งวิดีโอในฟีด → เต็มจอ — ไม่แตะ VideoView */
  const heroClipStyle = useAnimatedStyle(() => ({
    left: interpolate(enter.value, [0, 1], [originX, 0], 'clamp'),
    top: interpolate(enter.value, [0, 1], [originY, 0], 'clamp'),
    width: interpolate(enter.value, [0, 1], [originW, SCREEN_WIDTH], 'clamp'),
    height: interpolate(enter.value, [0, 1], [originH, SCREEN_HEIGHT], 'clamp'),
    opacity: interpolate(enter.value, [0.82, 1], [1, 0], 'clamp'),
  }));

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0.7, 1], [0, 1], 'clamp'),
  }));

  /** VideoView อยู่เต็มจอข้างใต้ — โชว์ตอนกรอบขยายเกือบจบ กันวิดีโอโผล่รอบโปสเตอร์ */
  const playerRevealStyle = useAnimatedStyle(() => ({
    opacity: hasHero ? interpolate(enter.value, [0.78, 1], [0, 1], 'clamp') : enter.value,
  }));

  /** พื้นดำหลังคลิป — ขึ้นเนียนตอนเข้า และจางตอนลากลง/ปัดขวา ให้เห็นฟีดข้างหลัง */
  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      enter.value *
      interpolate(dragY.value, [0, SCREEN_HEIGHT * 0.5], [1, 0], 'clamp') *
      interpolate(swipeX.value, [0, SCREEN_WIDTH], [1, 0], 'clamp'),
  }));

  return (
    <View style={styles.routeRoot}>
      <Animated.View pointerEvents="none" style={[styles.backdrop, backdropStyle]} />
      <GestureDetector gesture={swipeBackGesture}>
        <Animated.View style={[styles.root, swipeStyle]}>
          <DragDownDismiss onDismiss={dismiss} scrollY={scrollY} dragY={dragY} style={styles.root}>
            <Animated.View style={[styles.root, playerRevealStyle]}>
              <HomeFeedScreen
                channelEmbedded
                videoOnly
                initialFeedId={feedId}
                initialPlaybackTime={initialPlaybackTime}
                verticalScrollY={scrollY}
              />
            </Animated.View>
            <Animated.View style={[styles.header, { top: insets.top + 8 }, chromeStyle]} pointerEvents="box-none">
              <Pressable
                style={styles.button}
                onPress={closeToRight}
                accessibilityRole="button"
                accessibilityLabel="กลับไปหน้าฟีด"
                hitSlop={10}
              >
                <Ionicons name="chevron-back" size={30} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.button}
                onPress={() => router.push('/search')}
                accessibilityRole="button"
                accessibilityLabel="ค้นหา"
                hitSlop={10}
              >
                <Ionicons name="search" size={27} color="#fff" />
              </Pressable>
            </Animated.View>
          </DragDownDismiss>
        </Animated.View>
      </GestureDetector>
      {hasHero && heroCover ? (
        <Animated.View pointerEvents="none" style={[styles.heroClip, heroClipStyle]}>
          {posterUri ? (
            <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.heroFallback} />
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // โปร่งใส — ฟีดข้างหลังโผล่ผ่าน backdrop ที่จางตามการลาก (transparentModal)
  routeRoot: { flex: 1, backgroundColor: 'transparent' },
  root: { flex: 1, backgroundColor: 'transparent' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
  heroClip: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#050706',
    zIndex: 20,
  },
  heroFallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#050706',
  },
  header: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
});
