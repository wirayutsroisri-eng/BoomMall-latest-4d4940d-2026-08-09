import React, { useCallback, useEffect, useMemo } from 'react';
import { Dimensions, StyleProp, StyleSheet, ViewStyle } from 'react-native';
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
  rootInModal = false,
}: Props) {
  const dismissY = useSharedValue(0);

  useEffect(() => {
    dismissY.value = 0;
  }, [dismissY]);

  const finishDismiss = useCallback(() => {
    dismissY.value = 0;
    onDismiss();
  }, [dismissY, onDismiss]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetY(12)
        .failOffsetX([-28, 28])
        .onUpdate((e) => {
          'worklet';
          const atTop = scrollY ? scrollY.value <= 0.5 : true;
          if (!atTop && dismissY.value <= 0) {
            dismissY.value = 0;
            return;
          }
          // Only pull down (positive Y); ignore upward scroll
          dismissY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          'worklet';
          const shouldClose =
            dismissY.value > dismissDistance || e.velocityY > dismissVelocity;
          if (shouldClose) {
            dismissY.value = withTiming(SCREEN_H, { duration: 180 }, (finished) => {
              if (finished) runOnJS(finishDismiss)();
            });
          } else {
            dismissY.value = withSpring(0, { damping: 22, stiffness: 220 });
          }
        }),
    [dismissDistance, dismissVelocity, dismissY, enabled, finishDismiss, scrollY],
  );

  const sheetStyle = useAnimatedStyle(() => {
    const y = dismissY.value;
    const progress = Math.min(1, y / (SCREEN_H * 0.45));
    return {
      transform: [
        { translateY: y },
        { scale: interpolate(progress, [0, 1], [1, 0.94]) },
      ],
      borderRadius: interpolate(progress, [0, 1], [0, 16]),
    };
  });

  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismissY.value, [0, SCREEN_H * 0.4], [1, 0.2], 'clamp'),
  }));

  const body = (
    <>
      {showDim ? <Animated.View pointerEvents="none" style={[styles.dim, dimStyle]} /> : null}
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
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
  sheet: {
    overflow: 'hidden',
  },
});
