import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { OverlayTransform } from '@/modules/create/domain/overlay';
import type { TextOverlayObject } from '@/modules/create/domain/editorComposition';
import { TextOverlayVisual } from './TextOverlayRenderer';

type Props = {
  overlays: TextOverlayObject[];
  /** id ของชิ้นที่กำลังถูกเลือก (แสดงปุ่มแก้ไข/ลบ) */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTransformChange: (id: string, transform: OverlayTransform) => void;
  /** แตะพื้นที่ว่างบนจอ (นอกข้อความ) — ปิดโหมดเลือก/ล็อก */
  onBlankTap?: () => void;
};

/** Favor the natural one-finger-above / one-finger-below grip without stealing side touches. */
const TOUCH_PADDING_X = 8;
const TOUCH_PADDING_Y = 120;
const MIN_HIT_WIDTH = 48;
const MIN_HIT_HEIGHT = 240;
const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const GUIDE_SNAP_THRESHOLD = 8;
const GUIDE_RELEASE_THRESHOLD = 18;
const SAFE_GUIDE_MARGIN = 24;

function resolveGuideLine(raw: number, current: number, extent: number, halfExtent: number): number {
  'worklet';
  const middle = extent / 2;
  const end = extent - SAFE_GUIDE_MARGIN;
  if (current >= 0) {
    const currentTarget = current === SAFE_GUIDE_MARGIN
      ? SAFE_GUIDE_MARGIN + halfExtent
      : current === end
        ? end - halfExtent
        : middle;
    if (Math.abs(raw - currentTarget) <= GUIDE_RELEASE_THRESHOLD) return current;
  }
  if (Math.abs(raw - halfExtent - SAFE_GUIDE_MARGIN) <= GUIDE_SNAP_THRESHOLD) return SAFE_GUIDE_MARGIN;
  if (Math.abs(raw - middle) <= GUIDE_SNAP_THRESHOLD) return middle;
  if (Math.abs(raw + halfExtent - end) <= GUIDE_SNAP_THRESHOLD) return end;
  return -1;
}

/**
 * เลเยอร์ข้อความหลายชิ้น (Text Stickers) — ลากย้าย / บีบย่อ-ขยาย / หมุนสองนิ้ว
 * แตะที่ข้อความ → แสดงปุ่ม แก้ไข + ลบ (Popup) · แตะพื้นว่าง → ปิดโหมดเลือก
 *
 * หมายเหตุ: blankTap (แตะพื้นว่าง) ต้องเช็กระยะห่างจากทุกชิ้นก่อน — กันไม่ให้
 * แตะบนข้อความแล้วทั้งเลือก (onSelect) และปิดโหมด (onBlankTap) พร้อมกัน
 */
export function TextStickerLayer({
  overlays,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onTransformChange,
  onBlankTap,
}: Props) {
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setFrame({ w: width, h: height });
  };

  const blankTap = Gesture.Tap()
    .maxDistance(12)
    .onEnd(() => {
      if (onBlankTap) runOnJS(onBlankTap)();
    });

  return (
    <View style={styles.stage} onLayout={onLayout} pointerEvents="box-none">
      {frame.w > 0 ? (
        <>
          {onBlankTap ? (
            <GestureDetector gesture={blankTap}>
              <Animated.View style={StyleSheet.absoluteFill} />
            </GestureDetector>
          ) : null}
          {[...overlays]
            .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
            .map((overlay) => (
            <SingleTextSticker
              key={overlay.id}
              overlay={overlay}
              frameW={frame.w}
              frameH={frame.h}
              selected={selectedId === overlay.id}
              onSelect={() => onSelect(overlay.id)}
              onEdit={() => onEdit(overlay.id)}
              onDelete={() => onDelete(overlay.id)}
              onTransformChange={(t) => onTransformChange(overlay.id, t)}
              onBlankTap={onBlankTap}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

type SingleProps = {
  overlay: TextOverlayObject;
  frameW: number;
  frameH: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTransformChange: (t: OverlayTransform) => void;
  onBlankTap?: () => void;
};

function SingleTextSticker({
  overlay,
  frameW,
  frameH,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onTransformChange,
  onBlankTap,
}: SingleProps) {
  const [visualSize, setVisualSize] = useState({ width: 288, height: 64 });
  const sensorWidth = Math.max(
    MIN_HIT_WIDTH,
    visualSize.width * Math.max(1, overlay.transform.scale) + TOUCH_PADDING_X * 2,
  );
  const sensorHeight = Math.max(
    MIN_HIT_HEIGHT,
    visualSize.height * Math.max(1, overlay.transform.scale) + TOUCH_PADDING_Y * 2,
  );
  const nx = useSharedValue(overlay.transform.x);
  const ny = useSharedValue(overlay.transform.y);
  const scale = useSharedValue(overlay.transform.scale);
  const rotation = useSharedValue(overlay.transform.rotation);

  const startNx = useSharedValue(overlay.transform.x);
  const startNy = useSharedValue(overlay.transform.y);
  const startScale = useSharedValue(overlay.transform.scale);
  const startRotation = useSharedValue(overlay.transform.rotation);
  const pointerCount = useSharedValue(0);
  const gestureActive = useSharedValue(0);
  const oneFingerEligible = useSharedValue(0);
  const startCentroidX = useSharedValue(0);
  const startCentroidY = useSharedValue(0);
  const startDistance = useSharedValue(1);
  const startAngle = useSharedValue(0);
  const startVectorX = useSharedValue(0);
  const startVectorY = useSharedValue(0);
  const visualWidth = useSharedValue(visualSize.width);
  const visualHeight = useSharedValue(visualSize.height);
  const guideX = useSharedValue(-1);
  const guideY = useSharedValue(-1);

  const isInsideTextBounds = (x: number, y: number) => {
    'worklet';
    const dx = x - sensorWidth / 2;
    const dy = y - sensorHeight / 2;
    const cos = Math.cos(rotation.value);
    const sin = Math.sin(rotation.value);
    const localX = (dx * cos + dy * sin) / Math.max(MIN_SCALE, scale.value);
    const localY = (-dx * sin + dy * cos) / Math.max(MIN_SCALE, scale.value);
    return Math.abs(localX) <= visualWidth.value / 2 + 6
      && Math.abs(localY) <= visualHeight.value / 2 + 6;
  };

  const commitTransform = (x: number, y: number, nextScale: number, nextRotation: number) => {
    onTransformChange({ x, y, scale: nextScale, rotation: nextRotation });
  };

  const commitOnJS = () => {
    'worklet';
    runOnJS(commitTransform)(
      Math.min(1, Math.max(0, nx.value)),
      Math.min(1, Math.max(0, ny.value)),
      scale.value,
      rotation.value,
    );
  };

  const notifyGuideEntry = () => {
    void Haptics.selectionAsync();
  };

  const clearGuides = () => {
    'worklet';
    guideX.value = -1;
    guideY.value = -1;
  };

  const applyPositionWithGuides = (rawX: number, rawY: number, enabled: boolean) => {
    'worklet';
    if (!enabled) {
      clearGuides();
      nx.value = Math.min(1, Math.max(0, rawX / frameW));
      ny.value = Math.min(1, Math.max(0, rawY / frameH));
      return;
    }
    const previousX = guideX.value;
    const previousY = guideY.value;
    const absCos = Math.abs(Math.cos(rotation.value));
    const absSin = Math.abs(Math.sin(rotation.value));
    const halfWidth = (visualWidth.value * absCos + visualHeight.value * absSin) * scale.value / 2;
    const halfHeight = (visualWidth.value * absSin + visualHeight.value * absCos) * scale.value / 2;
    const nextGuideX = resolveGuideLine(rawX, previousX, frameW, halfWidth);
    const nextGuideY = resolveGuideLine(rawY, previousY, frameH, halfHeight);
    const enteredGuide =
      (nextGuideX >= 0 && nextGuideX !== previousX)
      || (nextGuideY >= 0 && nextGuideY !== previousY);
    guideX.value = nextGuideX;
    guideY.value = nextGuideY;
    const snappedX = nextGuideX < 0
      ? rawX
      : nextGuideX === SAFE_GUIDE_MARGIN
        ? SAFE_GUIDE_MARGIN + halfWidth
        : nextGuideX === frameW - SAFE_GUIDE_MARGIN
          ? frameW - SAFE_GUIDE_MARGIN - halfWidth
          : frameW / 2;
    const snappedY = nextGuideY < 0
      ? rawY
      : nextGuideY === SAFE_GUIDE_MARGIN
        ? SAFE_GUIDE_MARGIN + halfHeight
        : nextGuideY === frameH - SAFE_GUIDE_MARGIN
          ? frameH - SAFE_GUIDE_MARGIN - halfHeight
          : frameH / 2;
    nx.value = Math.min(1, Math.max(0, snappedX / frameW));
    ny.value = Math.min(1, Math.max(0, snappedY / frameH));
    if (enteredGuide) runOnJS(notifyGuideEntry)();
  };

  const rebaseOneFinger = (absoluteX: number, absoluteY: number) => {
    'worklet';
    pointerCount.value = 1;
    startNx.value = nx.value;
    startNy.value = ny.value;
    startCentroidX.value = absoluteX;
    startCentroidY.value = absoluteY;
  };

  const rebaseTwoFingers = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    absoluteX1: number,
    absoluteY1: number,
    absoluteX2: number,
    absoluteY2: number,
  ) => {
    'worklet';
    pointerCount.value = 2;
    startNx.value = nx.value;
    startNy.value = ny.value;
    startScale.value = scale.value;
    startRotation.value = rotation.value;
    startCentroidX.value = (absoluteX1 + absoluteX2) / 2;
    startCentroidY.value = (absoluteY1 + absoluteY2) / 2;
    startDistance.value = Math.max(1, Math.hypot(absoluteX2 - absoluteX1, absoluteY2 - absoluteY1));
    startAngle.value = Math.atan2(absoluteY2 - absoluteY1, absoluteX2 - absoluteX1);

    // Vector from the two-finger centroid to the overlay center. Keeping this
    // vector in the same similarity transform makes the text stay under hand.
    const localDx = sensorWidth / 2 - (x1 + x2) / 2;
    const localDy = sensorHeight / 2 - (y1 + y2) / 2;
    startVectorX.value = localDx;
    startVectorY.value = localDy;
  };

  const transformGesture = Gesture.Manual()
    .enabled(overlay.locked !== true)
    .shouldCancelWhenOutside(false)
    .onTouchesDown((event, manager) => {
      if (event.numberOfTouches === 1) {
        clearGuides();
        manager.begin();
        const touch = event.allTouches[0];
        if (touch) {
          gestureActive.value = 0;
          oneFingerEligible.value = isInsideTextBounds(touch.x, touch.y) ? 1 : 0;
          rebaseOneFinger(touch.absoluteX, touch.absoluteY);
        }
      } else if (event.numberOfTouches >= 2) {
        const first = event.allTouches[0];
        const second = event.allTouches[1];
        if (first && second) {
          if (gestureActive.value === 0) {
            manager.activate();
            gestureActive.value = 1;
          }
          rebaseTwoFingers(
            first.x, first.y, second.x, second.y,
            first.absoluteX, first.absoluteY, second.absoluteX, second.absoluteY,
          );
        }
      }
    })
    .onTouchesMove((event, manager) => {
      if (event.numberOfTouches >= 2) {
        const first = event.allTouches[0];
        const second = event.allTouches[1];
        if (!first || !second) return;
        if (pointerCount.value !== 2) {
          rebaseTwoFingers(
            first.x, first.y, second.x, second.y,
            first.absoluteX, first.absoluteY, second.absoluteX, second.absoluteY,
          );
          return;
        }
        const centroidX = (first.absoluteX + second.absoluteX) / 2;
        const centroidY = (first.absoluteY + second.absoluteY) / 2;
        const distance = Math.max(1, Math.hypot(
          second.absoluteX - first.absoluteX,
          second.absoluteY - first.absoluteY,
        ));
        const angle = Math.atan2(
          second.absoluteY - first.absoluteY,
          second.absoluteX - first.absoluteX,
        );
        const ratio = distance / startDistance.value;
        const angleDelta = Math.atan2(
          Math.sin(angle - startAngle.value),
          Math.cos(angle - startAngle.value),
        );
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale.value * ratio));
        const appliedRatio = nextScale / Math.max(0.001, startScale.value);
        const nextRotation = startRotation.value + angleDelta;
        const cos = Math.cos(angleDelta);
        const sin = Math.sin(angleDelta);
        const nextVectorX = (startVectorX.value * cos - startVectorY.value * sin) * appliedRatio;
        const nextVectorY = (startVectorX.value * sin + startVectorY.value * cos) * appliedRatio;
        const nextCenterX = startNx.value * frameW
          + (centroidX - startCentroidX.value)
          + nextVectorX - startVectorX.value;
        const nextCenterY = startNy.value * frameH
          + (centroidY - startCentroidY.value)
          + nextVectorY - startVectorY.value;
        const centroidMoved = Math.hypot(
          centroidX - startCentroidX.value,
          centroidY - startCentroidY.value,
        ) >= 1.5;
        scale.value = nextScale;
        rotation.value = nextRotation;
        applyPositionWithGuides(nextCenterX, nextCenterY, centroidMoved);
        return;
      }

      const touch = event.allTouches[0];
      if (!touch) return;
      if (pointerCount.value !== 1) {
        rebaseOneFinger(touch.absoluteX, touch.absoluteY);
        return;
      }
      if (gestureActive.value === 0) {
        if (oneFingerEligible.value === 0) return;
        const distance = Math.hypot(
          touch.absoluteX - startCentroidX.value,
          touch.absoluteY - startCentroidY.value,
        );
        if (distance < 4) return;
        manager.activate();
        gestureActive.value = 1;
      }
      applyPositionWithGuides(
        startNx.value * frameW + touch.absoluteX - startCentroidX.value,
        startNy.value * frameH + touch.absoluteY - startCentroidY.value,
        true,
      );
    })
    .onTouchesUp((event, manager) => {
      if (event.numberOfTouches === 0) {
        pointerCount.value = 0;
        clearGuides();
        if (gestureActive.value === 1) {
          commitOnJS();
          manager.end();
        } else {
          manager.fail();
        }
        gestureActive.value = 0;
        oneFingerEligible.value = 0;
        return;
      }
      // `allTouches` still contains the lifted pointer on UP. Rebase from the
      // remaining pointer so two fingers -> one finger continues without jump.
      const liftedId = event.changedTouches[0]?.id;
      const remaining = event.allTouches.find((touch) => touch.id !== liftedId);
      if (remaining) rebaseOneFinger(remaining.absoluteX, remaining.absoluteY);
    })
    .onTouchesCancelled((_event, manager) => {
      pointerCount.value = 0;
      clearGuides();
      if (gestureActive.value === 1) commitOnJS();
      gestureActive.value = 0;
      oneFingerEligible.value = 0;
      manager.end();
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(8)
    .onEnd((event) => {
      if (!isInsideTextBounds(event.x, event.y)) {
        if (onBlankTap) runOnJS(onBlankTap)();
        return;
      }
      runOnJS(overlay.locked === true ? onSelect : selected ? onEdit : onSelect)();
    });

  const gesture = Gesture.Simultaneous(transformGesture, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    left: nx.value * frameW,
    top: ny.value * frameH,
  }));

  const visualTransformStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}rad` }],
  }));

  const verticalGuideStyle = useAnimatedStyle(() => ({
    opacity: guideX.value >= 0 ? 1 : 0,
    transform: [{ translateX: guideX.value }],
  }));

  const horizontalGuideStyle = useAnimatedStyle(() => ({
    opacity: guideY.value >= 0 ? 1 : 0,
    transform: [{ translateY: guideY.value }],
  }));

  if (!overlay.text.trim()) return null;

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.verticalGuide, { height: frameH }, verticalGuideStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.horizontalGuide, { width: frameW }, horizontalGuideStyle]}
      />
      <Animated.View style={[styles.anchor, animatedStyle]} pointerEvents="box-none">
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[
              styles.touchSensor,
              {
                width: sensorWidth,
                height: sensorHeight,
                left: -sensorWidth / 2,
                top: -sensorHeight / 2,
              },
            ]}
          />
        </GestureDetector>
          <Animated.View
            pointerEvents="none"
            style={visualTransformStyle}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              if (width <= 0 || height <= 0) return;
              visualWidth.value = width;
              visualHeight.value = height;
              if (width !== visualSize.width || height !== visualSize.height) {
                setVisualSize({ width, height });
              }
            }}
          >
            <TextOverlayVisual overlay={overlay} mediaWidth={frameW} />
          </Animated.View>
        {selected ? (
          <View style={styles.popup} pointerEvents="box-none">
            {overlay.locked !== true ? (
              <Pressable
                style={styles.popupBtn}
                hitSlop={8}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onEdit();
                }}
                accessibilityLabel="แก้ไขข้อความ"
              >
                <Text style={styles.popupGlyph}>Aa</Text>
              </Pressable>
            ) : (
              <View style={[styles.popupBtn, styles.popupLocked]} accessibilityLabel="ข้อความถูกล็อก">
                <Text style={styles.popupGlyph}>🔒</Text>
              </View>
            )}
            <Pressable
              style={[styles.popupBtn, styles.popupDelete]}
              hitSlop={8}
              onPress={() => {
                void Haptics.selectionAsync();
                onDelete();
              }}
              accessibilityLabel="ลบข้อความ"
            >
              <Text style={styles.popupGlyph}>🗑</Text>
            </Pressable>
          </View>
          ) : null}
      </Animated.View>
    </>
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
  touchSensor: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  verticalGuide: {
    position: 'absolute',
    left: -0.5,
    top: 0,
    width: 1,
    zIndex: 20,
    backgroundColor: 'rgba(37,244,238,0.95)',
  },
  horizontalGuide: {
    position: 'absolute',
    left: 0,
    top: -0.5,
    height: 1,
    zIndex: 20,
    backgroundColor: 'rgba(37,244,238,0.95)',
  },
  popup: {
    position: 'absolute',
    top: -46,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  popupBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  popupDelete: {
    backgroundColor: 'rgba(254,44,85,0.35)',
  },
  popupLocked: { backgroundColor: 'rgba(254,44,85,0.5)' },
  popupGlyph: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
});
