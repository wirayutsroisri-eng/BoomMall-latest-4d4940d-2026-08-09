import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { OverlayTransform } from '@/modules/create/domain/overlay';

type Props = {
  sticker: string;
  transform: OverlayTransform;
  fontSize?: number;
};

/** สติกเกอร์ตำแหน่งล็อก — ใช้ตอน bake / พรีวิวนิ่ง */
export function LockedStickerOverlay({
  sticker,
  transform,
  fontSize = 72,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  if (!sticker) return null;

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
          <Text style={[styles.sticker, { fontSize }]} allowFontScaling={false}>
            {sticker}
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
    zIndex: 5,
  },
  anchor: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  sticker: {
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
});
