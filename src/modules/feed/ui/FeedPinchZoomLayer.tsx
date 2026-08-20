import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type Props = {
  children: React.ReactNode;
  /** Reset zoom when clip / photo page changes. */
  resetKey: string;
  enabled?: boolean;
  onZoomChange?: (zoomed: boolean) => void;
};

const MAX_SCALE = 3.5;
const MIN_SCALE = 1;

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

function clampPan(offset: number, span: number, scale: number) {
  'worklet';
  const extra = Math.max(0, ((scale - 1) * span) / 2);
  return clamp(offset, -extra, extra);
}

/** Pinch + pan zoom for full-bleed feed media (TikTok-style). */
export function FeedPinchZoomLayer({ children, resetKey, enabled = true, onZoomChange }: Props) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const spanW = useSharedValue(1);
  const spanH = useSharedValue(1);

  const notifyZoom = (zoomed: boolean) => {
    onZoomChange?.(zoomed);
  };

  const reset = () => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    notifyZoom(false);
  };

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const pinch = Gesture.Pinch()
    .enabled(enabled)
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = clamp(startScale.value * e.scale, MIN_SCALE, MAX_SCALE);
      scale.value = next;
      tx.value = clampPan(tx.value, spanW.value, next);
      ty.value = clampPan(ty.value, spanH.value, next);
      if (next > 1.04) runOnJS(notifyZoom)(true);
    })
    .onEnd(() => {
      if (scale.value <= 1.04) {
        scale.value = withSpring(1, { damping: 18, stiffness: 220 });
        tx.value = withSpring(0, { damping: 18, stiffness: 220 });
        ty.value = withSpring(0, { damping: 18, stiffness: 220 });
        runOnJS(notifyZoom)(false);
      }
    });

  const pan = Gesture.Pan()
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (scale.value > 1.04) state.activate();
      else state.fail();
    })
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      const s = scale.value;
      tx.value = clampPan(startTx.value + e.translationX, spanW.value, s);
      ty.value = clampPan(startTy.value + e.translationY, spanH.value, s);
    });

  const gesture = Gesture.Simultaneous(pinch, pan);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[StyleSheet.absoluteFill, style]}
        onLayout={(e) => {
          spanW.value = Math.max(1, e.nativeEvent.layout.width);
          spanH.value = Math.max(1, e.nativeEvent.layout.height);
        }}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
