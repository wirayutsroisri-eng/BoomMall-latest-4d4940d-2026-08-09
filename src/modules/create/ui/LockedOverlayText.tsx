import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { OverlayTransform } from '@/modules/create/domain/overlay';
import type { OverlayFontKey } from '@/modules/create/domain/overlayText';
import { OverlayTextLabel } from './OverlayTextLabel';

type Props = {
  text: string;
  color: string;
  transform: OverlayTransform;
  fontKey?: OverlayFontKey;
  fontSize?: number;
  italic?: boolean;
};

/** Static overlay for view-shot bake — same normalized anchor as MovableTextLayer */
export function LockedOverlayText({
  text,
  color,
  transform,
  fontKey = 'classic',
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
          <OverlayTextLabel
            text={text}
            color={color}
            fontKey={fontKey}
            italic={italic}
            fontSize={fontSize}
          />
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
});
