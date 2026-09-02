/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally mutated by UI-thread worklets. */
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MAX_SCALE = 4;

type Props = {
  children: React.ReactNode;
  active: boolean;
  resetKey: string;
  dismissY: SharedValue<number>;
  onDismiss: () => void;
  onZoomChange: (zoomed: boolean) => void;
  zoomEnabled?: boolean;
  /** หน้าฟีด: ลากปิดได้ทั้งขึ้นและลง (สไตล์ Facebook) — clips ใช้ลากลงอย่างเดียว */
  bidirectionalDismiss?: boolean;
};

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** Gesture priority: zoomed image pan > pinch/double tap > vertical dismiss. */
export function MediaViewerGestureLayer({
  children, active, resetKey, dismissY, onDismiss, onZoomChange, zoomEnabled = true, bidirectionalDismiss = false,
}: Props) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const pinchStartFocalX = useSharedValue(0);
  const pinchStartFocalY = useSharedValue(0);
  const pinchStartTx = useSharedValue(0);
  const pinchStartTy = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const zoomNotified = useSharedValue(0);

  const notifyZoom = (value: boolean) => onZoomChange(value);
  const finishDismiss = () => onDismiss();

  useEffect(() => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    zoomNotified.value = 0;
    // ไม่รีเซ็ต dismissY ตรงนี้ — parent ดูแลเองตอนเปิด
    // รีเซ็ตตรงนี้จะดึงรูป+พื้นดำกลับกลางจอ 1 เฟรมตอนปิด (resetKey เปลี่ยนตอน visible พลิก)
    onZoomChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const pinch = Gesture.Pinch().enabled(active && zoomEnabled)
    .onStart((event) => {
      startScale.value = scale.value;
      pinchStartTx.value = tx.value;
      pinchStartTy.value = ty.value;
      pinchStartFocalX.value = event.focalX - SCREEN_W / 2;
      pinchStartFocalY.value = event.focalY - SCREEN_H / 2;
    })
    .onUpdate((event) => {
      const nextScale = clamp(startScale.value * event.scale, 1, MAX_SCALE);
      const focalX = event.focalX - SCREEN_W / 2;
      const focalY = event.focalY - SCREEN_H / 2;
      const contentX = (pinchStartFocalX.value - pinchStartTx.value) / startScale.value;
      const contentY = (pinchStartFocalY.value - pinchStartTy.value) / startScale.value;
      const maxX = ((nextScale - 1) * SCREEN_W) / 2;
      const maxY = ((nextScale - 1) * SCREEN_H) / 2;

      tx.value = clamp(focalX - contentX * nextScale, -maxX, maxX);
      ty.value = clamp(focalY - contentY * nextScale, -maxY, maxY);
      scale.value = nextScale;
      if (nextScale > 1.03 && zoomNotified.value === 0) {
        zoomNotified.value = 1;
        runOnJS(notifyZoom)(true);
      }
    })
    .onEnd(() => {
      if (scale.value <= 1.03) {
        scale.value = withSpring(1);
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        zoomNotified.value = 0;
        runOnJS(notifyZoom)(false);
      }
    });

  const doubleTap = Gesture.Tap().enabled(active && zoomEnabled).numberOfTaps(2).maxDuration(260)
    .onEnd((_event, success) => {
      if (!success) return;
      const zoomIn = scale.value < 1.2;
      if (zoomIn) {
        const nextScale = 2.5;
        const focalX = _event.x - SCREEN_W / 2;
        const focalY = _event.y - SCREEN_H / 2;
        const maxX = ((nextScale - 1) * SCREEN_W) / 2;
        const maxY = ((nextScale - 1) * SCREEN_H) / 2;
        tx.value = withSpring(clamp(focalX * (1 - nextScale), -maxX, maxX), { damping: 20, stiffness: 220 });
        ty.value = withSpring(clamp(focalY * (1 - nextScale), -maxY, maxY), { damping: 20, stiffness: 220 });
        scale.value = withSpring(nextScale, { damping: 20, stiffness: 220 });
        zoomNotified.value = 1;
      } else {
        scale.value = withSpring(1, { damping: 20, stiffness: 220 });
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        zoomNotified.value = 0;
      }
      runOnJS(notifyZoom)(zoomIn);
    });

  const imagePan = Gesture.Pan().enabled(active && zoomEnabled).manualActivation(true)
    .onTouchesMove((_event, manager) => {
      if (scale.value > 1.03) manager.activate();
      else manager.fail();
    })
    .onStart(() => { startTx.value = tx.value; startTy.value = ty.value; })
    .onUpdate((event) => {
      const maxX = ((scale.value - 1) * SCREEN_W) / 2;
      const maxY = ((scale.value - 1) * SCREEN_H) / 2;
      tx.value = clamp(startTx.value + event.translationX, -maxX, maxX);
      ty.value = clamp(startTy.value + event.translationY, -maxY, maxY);
    });

  const dismiss = Gesture.Pan()
    .enabled(active)
    // หน้าฟีด: ลากขึ้น/ลง ก็ปิดได้ — clips ยังลากลงอย่างเดียว
    .activeOffsetY(bidirectionalDismiss ? [-10, 10] : 18)
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      if (scale.value > 1.03) return;
      if (bidirectionalDismiss) {
        // ติดนิ้วตามตัวจริง ทั้งขึ้นและลง
        dismissY.value = event.translationY;
      } else {
        dismissY.value = Math.max(0, event.translationY);
      }
    })
    .onEnd((event) => {
      if (scale.value > 1.03) {
        dismissY.value = 0;
        return;
      }
      const distance = Math.abs(dismissY.value);
      const velocity = Math.abs(event.velocityY);
      const distThreshold = bidirectionalDismiss ? SCREEN_H * 0.12 : SCREEN_H * 0.16;
      const velThreshold = bidirectionalDismiss ? 700 : 1050;
      if (distance > distThreshold || velocity > velThreshold) {
        const dir = dismissY.value >= 0 ? 1 : -1;
        dismissY.value = withTiming(dir * SCREEN_H, { duration: 220 }, (done) => {
          if (done) runOnJS(finishDismiss)();
        });
      } else {
        dismissY.value = withTiming(0, { duration: 200 });
      }
    });

  const gesture = Gesture.Simultaneous(pinch, doubleTap, imagePan, dismiss);
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.fill, imageStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
