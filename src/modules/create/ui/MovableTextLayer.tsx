import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  DEFAULT_OVERLAY_TRANSFORM,
  type OverlayTransform,
} from '@/modules/create/domain/overlay';
import type { OverlayFontKey } from '@/modules/create/domain/overlayText';
import { OverlayTextLabel } from './OverlayTextLabel';

type Props = {
  text: string;
  color: string;
  fontKey?: OverlayFontKey;
  italic?: boolean;
  initialTransform?: OverlayTransform;
  onEdit: () => void;
  onTransformChange?: (t: OverlayTransform) => void;
};

/**
 * TikTok-style movable text — normalized 0–1 coords for export across screens.
 */
export function MovableTextLayer({
  text,
  color,
  fontKey = 'classic',
  italic,
  initialTransform = DEFAULT_OVERLAY_TRANSFORM,
  onEdit,
  onTransformChange,
}: Props) {
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  const nx = useSharedValue(initialTransform.x);
  const ny = useSharedValue(initialTransform.y);
  const scale = useSharedValue(initialTransform.scale);
  const rotation = useSharedValue(initialTransform.rotation);
  const frameW = useSharedValue(1);
  const frameH = useSharedValue(1);

  const startNx = useSharedValue(initialTransform.x);
  const startNy = useSharedValue(initialTransform.y);
  const startScale = useSharedValue(initialTransform.scale);
  const startRotation = useSharedValue(initialTransform.rotation);

  useEffect(() => {
    nx.value = initialTransform.x;
    ny.value = initialTransform.y;
    scale.value = initialTransform.scale;
    rotation.value = initialTransform.rotation;
  }, [initialTransform, nx, ny, rotation, scale]);

  const emit = () => {
    onTransformChange?.({
      x: Math.min(1, Math.max(0, nx.value)),
      y: Math.min(1, Math.max(0, ny.value)),
      scale: scale.value,
      rotation: rotation.value,
    });
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setFrame({ w: width, h: height });
    frameW.value = width;
    frameH.value = height;
  };

  const pan = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      startNx.value = nx.value;
      startNy.value = ny.value;
    })
    .onUpdate((e) => {
      const nextX = startNx.value + e.translationX / frameW.value;
      const nextY = startNy.value + e.translationY / frameH.value;
      nx.value = Math.min(1, Math.max(0, nextX));
      ny.value = Math.min(1, Math.max(0, nextY));
    })
    .onEnd(() => {
      runOnJS(emit)();
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      scale.value = Math.min(4.5, Math.max(0.35, next));
    })
    .onEnd(() => {
      runOnJS(emit)();
    });

  const rotate = Gesture.Rotation()
    .onStart(() => {
      startRotation.value = rotation.value;
    })
    .onUpdate((e) => {
      rotation.value = startRotation.value + e.rotation;
    })
    .onEnd(() => {
      runOnJS(emit)();
    });

  const buzz = () => {
    void Haptics.selectionAsync();
  };

  const tap = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(8)
    .onEnd(() => {
      runOnJS(buzz)();
      runOnJS(onEdit)();
    });

  const gesture = Gesture.Simultaneous(Gesture.Exclusive(pan, tap), pinch, rotate);

  const animatedStyle = useAnimatedStyle(() => ({
    left: nx.value * frameW.value,
    top: ny.value * frameH.value,
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}rad` }],
  }));

  if (!text.trim()) return null;

  return (
    <View style={styles.stage} pointerEvents="box-none" onLayout={onLayout}>
      {frame.w > 0 ? (
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.anchor, animatedStyle]}>
            <OverlayTextLabel
              text={text}
              color={color}
              fontKey={fontKey}
              italic={italic}
            />
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 4,
  },
  anchor: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
