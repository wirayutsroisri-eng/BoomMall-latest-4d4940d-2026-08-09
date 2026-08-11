import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { OverlayTransform } from '@/modules/create/domain/overlay';

type Props = {
  sticker: string;
  initialTransform?: OverlayTransform;
  /** แตะพื้นว่างแล้ว — เปิดโหมดบีบขยายทั้งจอ */
  resizeArmed?: boolean;
  fontSize?: number;
  onTransformChange?: (t: OverlayTransform) => void;
  /** แตะพื้นที่ว่างหนึ่งครั้ง (นอกไอคอน) */
  onBlankTap?: () => void;
};

const DEFAULT: OverlayTransform = {
  x: 0.5,
  y: 0.42,
  scale: 1.25,
  rotation: 0,
};

/**
 * สติกเกอร์ — ลากย้ายบนไอคอน
 * แตะพื้นว่าง 1 ครั้ง → บีบสองนิ้วย่อ/ขยายได้ทั้งจอ
 */
export function MovableStickerLayer({
  sticker,
  initialTransform = DEFAULT,
  resizeArmed = false,
  fontSize = 72,
  onTransformChange,
  onBlankTap,
}: Props) {
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  const nx = useSharedValue(initialTransform.x);
  const ny = useSharedValue(initialTransform.y);
  const scale = useSharedValue(initialTransform.scale);
  const rotation = useSharedValue(initialTransform.rotation);
  const frameW = useSharedValue(1);
  const frameH = useSharedValue(1);
  const armed = useSharedValue(resizeArmed ? 1 : 0);

  const startNx = useSharedValue(initialTransform.x);
  const startNy = useSharedValue(initialTransform.y);
  const startScale = useSharedValue(initialTransform.scale);
  const startRotation = useSharedValue(initialTransform.rotation);

  armed.value = resizeArmed ? 1 : 0;

  const emit = () => {
    onTransformChange?.({
      x: Math.min(1, Math.max(0, nx.value)),
      y: Math.min(1, Math.max(0, ny.value)),
      scale: scale.value,
      rotation: rotation.value,
    });
  };

  const notifyBlankTap = () => {
    onBlankTap?.();
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setFrame({ w: width, h: height });
    frameW.value = width;
    frameH.value = height;
  };

  /** แตะพื้นว่าง → เปิดโหมดย่อ/ขยาย */
  const blankTap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((e) => {
      if (armed.value === 1) return;
      // ถ้าแตะใกล้ไอคอนมาก = ไม่นับเป็นพื้นว่าง
      const sx = nx.value * frameW.value;
      const sy = ny.value * frameH.value;
      const hit = Math.max(56, fontSize * scale.value * 0.55);
      const dx = e.x - sx;
      const dy = e.y - sy;
      if (dx * dx + dy * dy < hit * hit) return;
      runOnJS(notifyBlankTap)();
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      startNx.value = nx.value;
      startNy.value = ny.value;
    })
    .onUpdate((e) => {
      nx.value = Math.min(1, Math.max(0, startNx.value + e.translationX / frameW.value));
      ny.value = Math.min(1, Math.max(0, startNy.value + e.translationY / frameH.value));
    })
    .onEnd(() => {
      runOnJS(emit)();
    });

  const pinch = Gesture.Pinch()
    .enabled(resizeArmed)
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(0.25, startScale.value * e.scale));
    })
    .onEnd(() => {
      runOnJS(emit)();
    });

  const rotate = Gesture.Rotation()
    .enabled(resizeArmed)
    .onStart(() => {
      startRotation.value = rotation.value;
    })
    .onUpdate((e) => {
      rotation.value = startRotation.value + e.rotation;
    })
    .onEnd(() => {
      runOnJS(emit)();
    });

  /** ยังไม่ armed: บีบบนตัวไอคอนได้เลย; armed: บีบที่ไหนก็ได้ทั้งจอ */
  const stickerPinch = Gesture.Pinch()
    .enabled(!resizeArmed)
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(0.25, startScale.value * e.scale));
    })
    .onEnd(() => {
      runOnJS(emit)();
    });

  const stageGesture = resizeArmed
    ? Gesture.Simultaneous(pinch, rotate, pan)
    : blankTap;

  const stickerGesture = Gesture.Simultaneous(pan, stickerPinch);

  const animatedStyle = useAnimatedStyle(() => ({
    left: nx.value * frameW.value,
    top: ny.value * frameH.value,
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}rad` }],
  }));

  if (!sticker) return null;

  return (
    <View style={styles.stage} onLayout={onLayout}>
      {frame.w > 0 ? (
        <GestureDetector gesture={stageGesture}>
          <View style={StyleSheet.absoluteFill}>
            <View style={styles.armedBanner} pointerEvents="none">
              <Text style={styles.armedText}>
                {resizeArmed
                  ? 'บีบสองนิ้วเพื่อย่อ / ขยาย · ลากเพื่อย้าย'
                  : 'แตะพื้นว่างหนึ่งครั้ง เพื่อย่อ–ขยาย'}
              </Text>
            </View>

            {resizeArmed ? (
              <Animated.View style={[styles.anchor, animatedStyle]} pointerEvents="none">
                <View style={styles.selectionRing} />
                <Text style={[styles.sticker, { fontSize }]} allowFontScaling={false}>
                  {sticker}
                </Text>
              </Animated.View>
            ) : (
              <GestureDetector gesture={stickerGesture}>
                <Animated.View style={[styles.anchor, animatedStyle]}>
                  <Text style={[styles.sticker, { fontSize }]} allowFontScaling={false}>
                    {sticker}
                  </Text>
                </Animated.View>
              </GestureDetector>
            )}
          </View>
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
    zIndex: 5,
  },
  armedBanner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 6,
  },
  armedText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  anchor: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  selectionRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    marginLeft: -48,
    marginTop: -48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    borderStyle: 'dashed',
  },
  sticker: {
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
});
