import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { OverlayTransform } from '@/modules/create/domain/overlay';

type Props = {
  text: string;
  color: string;
  transform: OverlayTransform;
  /** base font size at scale=1 — ใช้ค่าเล็กกว่าบน thumbnail */
  fontSize?: number;
  italic?: boolean;
};

/**
 * เรนเดอร์ข้อความที่ตำแหน่ง normalized เดียวกับตอนแต่ง
 * anchor จุด (x,y) = กลางข้อความ
 */
export function LockedOverlayText({
  text,
  color,
  transform,
  fontSize = 36,
  italic,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  if (!text.trim()) return null;

  return (
    <View style={styles.stage} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 ? (
        <View
          style={[
            styles.anchor,
            {
              left: transform.x * size.w,
              top: transform.y * size.h,
              transform: [
                { scale: transform.scale },
                { rotate: `${transform.rotation}rad` },
              ],
            },
          ]}
        >
          <Text
            style={[
              styles.label,
              {
                color,
                fontSize,
                fontStyle: italic ? 'italic' : 'normal',
              },
            ]}
          >
            {text}
          </Text>
        </View>
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
  label: {
    width: 280,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
});
