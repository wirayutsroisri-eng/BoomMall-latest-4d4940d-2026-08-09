import React, { useCallback, useEffect } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
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
import { HomeFeedScreen } from './HomeFeedScreen';

const SCREEN_WIDTH = Dimensions.get('window').width;
const ENTER_MS = 360;
const enterEasing = Easing.bezier(0.22, 1, 0.36, 1);

export function VideoFeedScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const closing = useSharedValue(false);
  /** 0→1 หลัง mount — ใช้ขยายเข้าจอ ไม่ใส่ opacity ค้างบน VideoView */
  const enter = useSharedValue(0);
  const entered = useSharedValue(false);
  const { feedId, startTime } = useLocalSearchParams<{ feedId?: string; startTime?: string }>();
  const initialPlaybackTime = Number.isFinite(Number(startTime)) ? Math.max(0, Number(startTime)) : 0;

  useEffect(() => {
    entered.value = false;
    enter.value = 0;
    const id = requestAnimationFrame(() => {
      enter.value = withTiming(1, { duration: ENTER_MS, easing: enterEasing }, (finished) => {
        if (finished) entered.value = true;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [enter, entered]);

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
    // idle หลังเข้าจอแล้ว: ไม่มี opacity/transform — กัน VideoView ทับชีตคอมเมนต์
    if (swipeX.value === 0 && entered.value) {
      return {};
    }
    if (swipeX.value === 0) {
      // ตอนกำลังเข้าจอ: ขยายจาก 0.88 → 1 (ไม่มี opacity flash)
      return {
        transform: [{ scale: interpolate(enter.value, [0, 1], [0.88, 1], 'clamp') }],
      };
    }
    return {
      opacity: interpolate(swipeX.value, [0, SCREEN_WIDTH], [1, 0.88], 'clamp'),
      transform: [
        { translateX: swipeX.value },
        { scale: interpolate(swipeX.value, [0, SCREEN_WIDTH], [1, 0.96], 'clamp') },
      ],
    };
  });

  return (
    <View style={styles.routeRoot}>
      <GestureDetector gesture={swipeBackGesture}>
        <Animated.View style={[styles.root, swipeStyle]}>
          <DragDownDismiss onDismiss={dismiss} scrollY={scrollY} style={styles.root}>
            <HomeFeedScreen
              channelEmbedded
              videoOnly
              initialFeedId={feedId}
              initialPlaybackTime={initialPlaybackTime}
              verticalScrollY={scrollY}
            />
            <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
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
            </View>
          </DragDownDismiss>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // ดำทึบทันทีตั้งแต่เฟรมแรก — ไม่โปร่งใสให้ฟีดโผล่
  routeRoot: { flex: 1, backgroundColor: '#000' },
  root: { flex: 1, backgroundColor: '#000' },
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
