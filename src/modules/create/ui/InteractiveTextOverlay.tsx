import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DEFAULT_OVERLAY_TRANSFORM,
  type OverlayTransform,
} from '@/modules/create/domain/overlay';
import type { OverlayFontKey } from '@/modules/create/domain/overlayText';
import { LiveTextEditorOverlay } from './LiveTextEditorOverlay';
import { LockedOverlayText } from './LockedOverlayText';
import { MovableTextLayer } from './MovableTextLayer';

export type InteractiveTextOverlayProps = {
  editing: boolean;
  locked?: boolean;
  text: string;
  color: string;
  fontKey?: OverlayFontKey;
  transform: OverlayTransform;
  onTextChange: (text: string) => void;
  onColorChange: (color: string) => void;
  onFontChange?: (font: OverlayFontKey) => void;
  onTransformChange: (transform: OverlayTransform) => void;
  onEditingChange: (editing: boolean) => void;
};

/**
 * TikTok-style text overlay — live edit + draggable floating layer.
 * Place inside the media canvas so coordinates match export frame.
 */
export function InteractiveTextOverlay({
  editing,
  locked = false,
  text,
  color,
  fontKey = 'classic',
  transform,
  onTextChange,
  onColorChange,
  onFontChange,
  onTransformChange,
  onEditingChange,
}: InteractiveTextOverlayProps) {
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    if (editing) setDraft(text);
  }, [editing, text]);

  const finishEditing = () => {
    const next = draft.trim();
    onTextChange(next);
    onEditingChange(false);
  };

  const openEditing = () => {
    setDraft(text);
    onEditingChange(true);
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      {!editing && text.trim() ? (
        locked ? (
          <LockedOverlayText
            text={text}
            color={color}
            transform={transform}
            italic={fontKey === 'halloween'}
          />
        ) : (
          <MovableTextLayer
            text={text}
            color={color}
            fontKey={fontKey}
            italic={fontKey === 'halloween'}
            initialTransform={transform}
            onTransformChange={onTransformChange}
            onEdit={openEditing}
          />
        )
      ) : null}

      <LiveTextEditorOverlay
        visible={editing}
        text={draft}
        color={color}
        fontKey={fontKey}
        onTextChange={setDraft}
        onColorChange={onColorChange}
        onFontChange={onFontChange ?? (() => undefined)}
        onDone={finishEditing}
      />
    </View>
  );
}

export { DEFAULT_OVERLAY_TRANSFORM };

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
  },
});
