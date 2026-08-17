import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { clampCrop, type CropRect } from '@/modules/create/editor/domain/cropMath';

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

type Props = {
  crop: CropRect;
  stageW: number;
  stageH: number;
  ratio: number | null;
  onCommit: (crop: CropRect) => void;
};

/**
 * Movable crop window — lock a ratio or drag freely. Does not bake pixels until save.
 */
export function CropFrameOverlay({ crop, stageW, stageH, ratio, onCommit }: Props) {
  const x = useSharedValue(crop.x);
  const y = useSharedValue(crop.y);
  const w = useSharedValue(crop.width);
  const h = useSharedValue(crop.height);
  const start = useSharedValue({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    x.value = crop.x;
    y.value = crop.y;
    w.value = crop.width;
    h.value = crop.height;
  }, [crop.x, crop.y, crop.width, crop.height, x, y, w, h]);

  const emit = () => {
    onCommit(clampCrop({ x: x.value, y: y.value, width: w.value, height: h.value }, stageW, stageH));
  };

  const makeHandle = (kind: Handle) =>
    Gesture.Pan()
      .blocksExternalGesture()
      .onStart(() => {
        'worklet';
        start.value = { x: x.value, y: y.value, w: w.value, h: h.value };
      })
      .onUpdate((e) => {
        'worklet';
        const s = start.value;
        const min = 64;
        let nx = s.x;
        let ny = s.y;
        let nw = s.w;
        let nh = s.h;

        if (kind === 'move') {
          nx = s.x + e.translationX;
          ny = s.y + e.translationY;
        }
        if (kind === 'e' || kind === 'ne' || kind === 'se') {
          nw = s.w + e.translationX;
        }
        if (kind === 'w' || kind === 'nw' || kind === 'sw') {
          nx = s.x + e.translationX;
          nw = s.w - e.translationX;
        }
        if (kind === 's' || kind === 'se' || kind === 'sw') {
          nh = s.h + e.translationY;
        }
        if (kind === 'n' || kind === 'ne' || kind === 'nw') {
          ny = s.y + e.translationY;
          nh = s.h - e.translationY;
        }

        if (ratio != null && kind !== 'move') {
          if (kind === 'e' || kind === 'w') {
            nh = nw / ratio;
            ny = s.y + (s.h - nh) / 2;
          } else if (kind === 'n' || kind === 's') {
            nw = nh * ratio;
            nx = s.x + (s.w - nw) / 2;
          } else {
            nh = nw / ratio;
            if (kind === 'nw' || kind === 'ne') {
              ny = s.y + s.h - nh;
            }
            if (kind === 'nw' || kind === 'sw') {
              nx = s.x + s.w - nw;
            }
          }
        }

        if (nw < min) {
          if (kind.includes('w') || kind === 'w') nx = s.x + s.w - min;
          nw = min;
          if (ratio != null) nh = nw / ratio;
        }
        if (nh < min) {
          if (kind.includes('n') || kind === 'n') ny = s.y + s.h - min;
          nh = min;
          if (ratio != null) nw = nh * ratio;
        }

        nx = Math.min(stageW - nw, Math.max(0, nx));
        ny = Math.min(stageH - nh, Math.max(0, ny));
        nw = Math.min(stageW - nx, nw);
        nh = Math.min(stageH - ny, nh);

        x.value = nx;
        y.value = ny;
        w.value = nw;
        h.value = nh;
      })
      .onEnd(() => {
        'worklet';
        runOnJS(emit)();
      });

  const boxStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));

  const dimTop = useAnimatedStyle(() => ({ height: y.value }));
  const dimBottom = useAnimatedStyle(() => ({
    top: y.value + h.value,
    height: Math.max(0, stageH - (y.value + h.value)),
  }));
  const dimLeft = useAnimatedStyle(() => ({
    top: y.value,
    height: h.value,
    width: x.value,
  }));
  const dimRight = useAnimatedStyle(() => ({
    top: y.value,
    left: x.value + w.value,
    height: h.value,
    width: Math.max(0, stageW - (x.value + w.value)),
  }));

  const handles: Array<{ key: Handle; style: object }> = useMemo(
    () => [
      { key: 'nw', style: styles.hNW },
      { key: 'ne', style: styles.hNE },
      { key: 'sw', style: styles.hSW },
      { key: 'se', style: styles.hSE },
      { key: 'n', style: styles.hN },
      { key: 's', style: styles.hS },
      { key: 'e', style: styles.hE },
      { key: 'w', style: styles.hW },
    ],
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.dimBand, dimTop]} pointerEvents="none" />
      <Animated.View style={[styles.dimBand, dimBottom]} pointerEvents="none" />
      <Animated.View style={[styles.dimSide, dimLeft]} pointerEvents="none" />
      <Animated.View style={[styles.dimSide, dimRight]} pointerEvents="none" />

      <GestureDetector gesture={makeHandle('move')}>
        <Animated.View style={[styles.cropBox, boxStyle]}>
          <View style={styles.gridH1} />
          <View style={styles.gridH2} />
          <View style={styles.gridV1} />
          <View style={styles.gridV2} />
          {handles.map((item) => (
            <GestureDetector key={item.key} gesture={makeHandle(item.key)}>
              <View style={[styles.handleHit, item.style]}>
                {item.key === 'n' || item.key === 's' ? (
                  <View style={[styles.handleBar, styles.handleBarH]} />
                ) : null}
                {item.key === 'e' || item.key === 'w' ? (
                  <View style={[styles.handleBar, styles.handleBarV]} />
                ) : null}
                {item.key === 'nw' ? <View style={[styles.corner, styles.cornerNW]} /> : null}
                {item.key === 'ne' ? <View style={[styles.corner, styles.cornerNE]} /> : null}
                {item.key === 'sw' ? <View style={[styles.corner, styles.cornerSW]} /> : null}
                {item.key === 'se' ? <View style={[styles.corner, styles.cornerSE]} /> : null}
              </View>
            </GestureDetector>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  dimBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dimSide: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  gridH1: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.33%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridH2: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '66.66%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridV1: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridV2: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '66.66%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  handleHit: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hNW: { left: -18, top: -18 },
  hNE: { right: -18, top: -18 },
  hSW: { left: -18, bottom: -18 },
  hSE: { right: -18, bottom: -18 },
  hN: { top: -18, alignSelf: 'center', left: '50%', marginLeft: -18 },
  hS: { bottom: -18, alignSelf: 'center', left: '50%', marginLeft: -18 },
  hE: { right: -18, top: '50%', marginTop: -18 },
  hW: { left: -18, top: '50%', marginTop: -18 },
  handleBar: {
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  handleBarH: { width: 28, height: 4 },
  handleBarV: { width: 4, height: 28 },
  corner: {
    width: 20,
    height: 20,
    backgroundColor: 'transparent',
    borderColor: '#fff',
  },
  cornerNW: { borderTopWidth: 4, borderLeftWidth: 4 },
  cornerNE: { borderTopWidth: 4, borderRightWidth: 4 },
  cornerSW: { borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerSE: { borderBottomWidth: 4, borderRightWidth: 4 },
});
