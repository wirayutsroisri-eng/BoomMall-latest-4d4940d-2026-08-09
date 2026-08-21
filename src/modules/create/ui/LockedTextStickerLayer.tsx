import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { OverlayFontKey } from '@/modules/create/domain/overlayText';
import { OverlayTextLabel } from './OverlayTextLabel';

/**
 * Sticker ที่รับได้ — หลวมกว่า OverlayTextSticker เพราะข้อมูลจากฟีด/backend
 * อาจเป็น fontKey: string ธรรมดา (ไม่ใช่ union ที่ตายตัว)
 */
export type LockedTextSticker = {
  id: string;
  text: string;
  color: string;
  fontKey: string;
  transform: { x: number; y: number; scale: number; rotation: number };
};

type Props = {
  stickers: LockedTextSticker[];
};


/**
 * Static multi-text-sticker layer for view-shot bake — same normalized anchor
 * as TextStickerLayer but without Reanimated gestures so it renders in the
 * snapshot. Renders every sticker so none is lost when baking to the image.
 */
export function LockedTextStickerLayer({ stickers }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const visible = stickers.filter((s) => s.text.trim().length > 0);
  if (!visible.length) return null;

  const toFontKey = (raw: string): OverlayFontKey =>
    raw === 'kanit' || raw === 'mitr' || raw === 'halloween' ? raw : 'classic';


  return (
    <View style={styles.stage} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0
        ? visible.map((s) => (
            <View
              key={s.id}
              style={[
                styles.anchor,
                {
                  left: s.transform.x * size.w,
                  top: s.transform.y * size.h,
                  transform: [
                    { scale: s.transform.scale },
                    { rotate: `${s.transform.rotation}rad` },
                  ],
                },
              ]}
            >
              <OverlayTextLabel
                text={s.text}
                color={s.color}
                fontKey={toFontKey(s.fontKey)}
                italic={s.fontKey === 'halloween'}
              />

            </View>
          ))
        : null}
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
