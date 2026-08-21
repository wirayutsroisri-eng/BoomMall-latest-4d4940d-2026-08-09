import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DEFAULT_OVERLAY_TRANSFORM,
  type OverlayTransform,
} from '@/modules/create/domain/overlay';
import type { OverlayFontKey } from '@/modules/create/domain/overlayText';
import {
  DEFAULT_TEXT_OVERLAY_STYLE,
  type TextOverlayObject,
} from '@/modules/create/domain/editorComposition';
import { TextStickerLayer } from './TextStickerLayer';

type Props = {
  text: string;
  color: string;
  fontKey?: OverlayFontKey;
  italic?: boolean;
  initialTransform?: OverlayTransform;
  onEdit: () => void;
  onTransformChange?: (transform: OverlayTransform) => void;
};

/**
 * Capture compatibility adapter. Gesture ownership lives in TextStickerLayer,
 * so capture and editor cannot run different Pan/Pinch/Rotation writers.
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
  const overlay = useMemo<TextOverlayObject>(() => ({
    id: 'capture-text-overlay',
    mediaId: 'capture-media',
    type: 'text',
    text,
    transform: initialTransform,
    style: {
      ...DEFAULT_TEXT_OVERLAY_STYLE,
      color,
      fontKey,
      fontStyle: italic ? 'italic' : 'normal',
    },
  }), [color, fontKey, initialTransform, italic, text]);

  if (!text.trim()) return null;

  return (
    <View style={styles.stage} pointerEvents="box-none">
      <TextStickerLayer
        overlays={[overlay]}
        selectedId={null}
        onSelect={onEdit}
        onEdit={onEdit}
        onDelete={() => undefined}
        onTransformChange={(_id, transform) => onTransformChange?.(transform)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFill,
    zIndex: 4,
  },
});
