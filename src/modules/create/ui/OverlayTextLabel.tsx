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
}: Props) {
  if (!text.trim()) return null;

  const weight = fontWeight(fontKey);
  const isItalic = italic ?? fontKey === 'halloween';

  return (
    <View style={[styles.wrap, { maxWidth }]}>
      {STROKE.map(([dx, dy]) => (
        <Text
          key={`${dx}-${dy}`}
          pointerEvents="none"
          style={[
            styles.layer,
            styles.stroke,
            {
              fontSize,
              fontWeight: weight,
              fontStyle: isItalic ? 'italic' : 'normal',
              transform: [{ translateX: dx }, { translateY: dy }],
            },
          ]}
        >
          {text}
        </Text>
      ))}
      <Text
        style={[
          styles.layer,
          {
            color,
            fontSize,
            fontWeight: weight,
            fontStyle: isItalic ? 'italic' : 'normal',
            textShadowColor: 'rgba(0,0,0,0.65)',
            textShadowRadius: 10,
            textShadowOffset: { width: 0, height: 2 },
          },
        ]}
      >
        {text}
      </Text>
      <View pointerEvents="none" style={styles.highlight} />
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
    width: '100%',
  },
  stroke: {
    position: 'absolute',
    color: '#000',
    opacity: 0.88,
  },
  highlight: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 8,
    zIndex: -1,
  },
});
