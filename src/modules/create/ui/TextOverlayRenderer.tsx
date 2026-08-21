import React, { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  DEFAULT_TEXT_OVERLAY_STYLE,
  type TextOverlayObject,
} from '@/modules/create/domain/editorComposition';
import { OverlayTextLabel } from './OverlayTextLabel';

type VisualProps = { overlay: TextOverlayObject; mediaWidth: number };

/** Shared visual representation used by Editor, Publish Preview and Feed. */
export const TextOverlayVisual = memo(function TextOverlayVisual({ overlay, mediaWidth }: VisualProps) {
  const style = { ...DEFAULT_TEXT_OVERLAY_STYLE, ...overlay.style };
  const fontSize = Math.max(10, (style.fontSize ?? DEFAULT_TEXT_OVERLAY_STYLE.fontSize!) * mediaWidth);
  return (
    <OverlayTextLabel
      text={overlay.text}
      color={style.color}
      fontKey={style.fontKey}
      italic={style.fontKey === 'halloween'}
      fontSize={fontSize}
      maxWidth={mediaWidth * 0.72}
      fontWeight={style.fontWeight}
      fontFamily={style.fontFamily}
      fontStyle={style.fontStyle}
      letterSpacing={style.letterSpacing}
      backgroundColor={style.backgroundColor}
      backgroundOpacity={style.backgroundOpacity}
      strokeColor={style.strokeColor}
      strokeWidth={style.strokeWidth}
      alignment={style.alignment}
    />
  );
});

type RendererProps = {
  overlays: TextOverlayObject[];
  sourceSize?: { width: number; height: number };
  contentFit?: 'contain' | 'cover';
};

export const TextOverlayRenderer = memo(function TextOverlayRenderer({
  overlays,
  sourceSize,
  contentFit = 'contain',
}: RendererProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size.width || height !== size.height)) {
      setSize({ width, height });
    }
  };
  if (!overlays.some((overlay) => overlay.text.trim())) return null;
  const bounds = (() => {
    if (!sourceSize || size.width <= 0 || size.height <= 0) {
      return { left: 0, top: 0, width: size.width, height: size.height };
    }
    const scale = contentFit === 'cover'
      ? Math.max(size.width / sourceSize.width, size.height / sourceSize.height)
      : Math.min(size.width / sourceSize.width, size.height / sourceSize.height);
    const width = sourceSize.width * scale;
    const height = sourceSize.height * scale;
    return { left: (size.width - width) / 2, top: (size.height - height) / 2, width, height };
  })();
  const anchorWidth = bounds.width * 0.72;
  return (
    <View style={styles.stage} pointerEvents="none" onLayout={onLayout}>
      {size.width > 0 ? overlays.map((overlay) => (
        <View
          key={overlay.id}
          collapsable={false}
          renderToHardwareTextureAndroid
          needsOffscreenAlphaCompositing
          style={[
            styles.anchor,
            {
              width: anchorWidth,
              minHeight: Math.max(32, bounds.width * 0.14),
              left: bounds.left + overlay.transform.x * bounds.width - anchorWidth / 2,
              top: bounds.top + overlay.transform.y * bounds.height - Math.max(32, bounds.width * 0.14) / 2,
              transform: [
                { scale: overlay.transform.scale },
                { rotate: `${overlay.transform.rotation}rad` },
              ],
            },
          ]}
        >
          <TextOverlayVisual overlay={overlay} mediaWidth={bounds.width} />
        </View>
      )) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  stage: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 4 },
  anchor: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
