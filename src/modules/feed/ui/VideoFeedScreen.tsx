import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { HomeFeedScreen } from './HomeFeedScreen';

export function VideoFeedScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const { feedId, startTime } = useLocalSearchParams<{ feedId?: string; startTime?: string }>();
  const initialPlaybackTime = Number.isFinite(Number(startTime)) ? Math.max(0, Number(startTime)) : 0;
  const dismiss = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');
  const swipeBackGesture = Gesture.Pan()
    .cancelsTouchesInView(false)
    .activeOffsetX(12)
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      if (event.translationX < 0) return;
      swipeX.value = event.translationX;
    })
    .onEnd((event) => {
      if (swipeX.value > 90 || event.velocityX > 800) {
        runOnJS(dismiss)();
      } else {
        swipeX.value = withSpring(0, { damping: 24, stiffness: 260 });
      }
    });
  const swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: swipeX.value }] }));

  return (
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
              onPress={dismiss}
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
  );
}

const styles = StyleSheet.create({
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
