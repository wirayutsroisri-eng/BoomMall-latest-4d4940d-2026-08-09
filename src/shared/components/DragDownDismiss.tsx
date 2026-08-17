import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dimensions, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const SCREEN_H = Dimensions.get('window').height;

type Props = {
  /** Called when drag-down dismiss completes */
  onDismiss: () => void;
  children: React.ReactNode;
  /** When false, pan is disabled (default true) */
  enabled?: boolean;
  /**
   * Optional scroll offset of an inner list.
   * Dismiss only starts when this is <= 0 (pulled from top).
   */
  scrollY?: SharedValue<number>;
  /** Distance (px) before release closes — default ~18% screen */
  dismissDistance?: number;
  /** Velocity (px/s) that forces close */
  dismissVelocity?: number;
  style?: StyleProp<ViewStyle>;
  /** Style for GestureHandlerRootView when rootInModal */
  rootStyle?: StyleProp<ViewStyle>;
  /** Dim layer behind sheet while dragging (for transparent modals) */
  showDim?: boolean;
  /** Tap the dimmed area to close. Defaults to true when showDim. */
  dimPressToDismiss?: boolean;
  /** Wrap with GestureHandlerRootView (needed inside RN Modal) */
  rootInModal?: boolean;
};

/**
 * Iron rule: any closable surface must support drag-down to dismiss.
 * Wrap modal / full-screen closeable UI with this component.
 */
export function DragDownDismiss({
  onDismiss,
  children,
  enabled = true,
  scrollY,
  dismissDistance = SCREEN_H * 0.18,
  dismissVelocity = 1100,
  style,
  rootStyle,
  showDim = false,
  dimPressToDismiss,
  rootInModal = false,
}: Props) {
  const dismissY = useSharedValue(0);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    dismissY.value = 0;
  }, [dismissY]);

  const finishDismiss = useCallback(() => {
    onDismissRef.current();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .maxPointers(1)
        .activeOffsetY(12)
        .failOffsetX([-28, 28])
        .onUpdate((e) => {
          'worklet';
          const atTop = scrollY ? scrollY.value <= 0.5 : true;
          if (!atTop && dismissY.value <= 0) {
            dismissY.value = 0;
            return;
          }
          dismissY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          'worklet';
          const shouldClose =
            dismissY.value > dismissDistance || e.velocityY > dismissVelocity;
          if (shouldClose) {
            dismissY.value = withTiming(SCREEN_H, { duration: 200 }, (finished) => {
              if (finished) runOnJS(finishDismiss)();
            });
          } else {
            dismissY.value = withSpring(0, {
              damping: 28,
              stiffness: 260,
              mass: 0.7,
              overshootClamping: true,
            });
          }
        }),
    [dismissDistance, dismissVelocity, dismissY, enabled, finishDismiss, scrollY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dismissY.value }],
  }));

  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismissY.value, [0, SCREEN_H * 0.55], [1, 0], 'clamp'),
  }));

  const tapDim = dimPressToDismiss ?? showDim;

  const closeFromDim = useCallback(() => {
    dismissY.value = withTiming(SCREEN_H, { duration: 180 }, (finished) => {
      if (finished) runOnJS(finishDismiss)();
    });
  }, [dismissY, finishDismiss]);

  const body = (
    <>
      {showDim ? (
        <Pressable
          style={styles.dimHit}
          onPress={tapDim ? closeFromDim : undefined}
          accessibilityLabel="ปิด"
        >
          <Animated.View pointerEvents="none" style={[styles.dim, dimStyle]} />
        </Pressable>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, style, sheetStyle]}>{children}</Animated.View>
      </GestureDetector>
    </>
  );

  if (rootInModal) {
    return <GestureHandlerRootView style={[styles.root, rootStyle]}>{body}</GestureHandlerRootView>;
  }

  return <>{body}</>;
}

/** Stack options helper — enable vertical swipe-down dismiss on Expo Router modals */
export const dismissibleModalOptions = {
  gestureEnabled: true,
  gestureDirection: 'vertical' as const,
  animation: 'slide_from_bottom' as const,
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  dimHit: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    overflow: 'visible',
    zIndex: 2,
  },
});
