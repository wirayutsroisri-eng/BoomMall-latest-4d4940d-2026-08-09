import React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import type { OverlayFontKey } from '@/modules/create/domain/overlayText';

const STROKE = [
  [-2, 0],
  [2, 0],
  [0, -2],
  [0, 2],
  [-1.5, -1.5],
  [1.5, -1.5],
  [-1.5, 1.5],
  [1.5, 1.5],
] as const;

type Props = {
  text: string;
  color: string;
  fontKey?: OverlayFontKey;
  italic?: boolean;
  fontSize?: number;
  maxWidth?: number;
  fontWeight?: TextStyle['fontWeight'];
  backgroundColor?: string;
  backgroundOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  alignment?: TextStyle['textAlign'];
  fontFamily?: string;
  fontStyle?: TextStyle['fontStyle'];
  letterSpacing?: number;
};

function fontWeight(fontKey: OverlayFontKey | undefined): TextStyle['fontWeight'] {
  if (fontKey === 'halloween') return '400';
  return '900';
}

/** TikTok-style label — stroke + shadow for readability on any background */
export function OverlayTextLabel({
  text,
  color,
  fontKey = 'classic',
  italic,
  fontSize = 36,
  maxWidth = 280,
  fontWeight: requestedWeight,
  backgroundColor = 'rgba(0,0,0,0.22)',
  backgroundOpacity = 1,
  strokeColor = '#000000',
  strokeWidth = 2,
  alignment = 'center',
  fontFamily,
  fontStyle: requestedFontStyle,
  letterSpacing = 0,
}: Props) {
  if (!text.trim()) return null;

  const weight = requestedWeight ?? fontWeight(fontKey);
  const isItalic = requestedFontStyle
    ? requestedFontStyle === 'italic'
    : italic ?? fontKey === 'halloween';
  const hasBackground = backgroundOpacity > 0 && backgroundColor !== 'transparent';
  const hasStroke = strokeWidth > 0 && strokeColor !== 'transparent';

  return (
    <View style={[styles.wrap, { maxWidth }]}>
      {hasStroke ? STROKE.map(([dx, dy]) => (
        <Text
          key={`${dx}-${dy}`}
          pointerEvents="none"
          style={[
            styles.layer,
            styles.stroke,
            {
              fontSize,
              fontWeight: weight,
              fontFamily,
              letterSpacing,
              fontStyle: isItalic ? 'italic' : 'normal',
              color: strokeColor,
              textAlign: alignment,
              transform: [
                { translateX: (dx / 2) * strokeWidth },
                { translateY: (dy / 2) * strokeWidth },
              ],
            },
          ]}
        >
          {text}
        </Text>
      )) : null}
      <Text
        style={[
          styles.layer,
          styles.fill,
          {
            color,
            fontSize,
            fontWeight: weight,
            fontFamily,
            letterSpacing,
            fontStyle: isItalic ? 'italic' : 'normal',
            textAlign: alignment,
            textShadowColor: hasBackground ? 'rgba(0,0,0,0.65)' : 'transparent',
            textShadowRadius: hasBackground ? 10 : 0,
            textShadowOffset: hasBackground ? { width: 0, height: 2 } : { width: 0, height: 0 },
          },
        ]}
      >
        {text}
      </Text>
      {hasBackground ? (
        <View
          pointerEvents="none"
          style={[styles.highlight, { backgroundColor, opacity: backgroundOpacity }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  layer: {
    textAlign: 'center',
    alignSelf: 'center',
  },

  stroke: {
    position: 'absolute',
    color: '#000',
    opacity: 0.88,
    zIndex: 0,
  },
  fill: { zIndex: 1 },
  highlight: {
    ...StyleSheet.absoluteFill,
    borderRadius: 8,
    zIndex: -1,
  },
});
