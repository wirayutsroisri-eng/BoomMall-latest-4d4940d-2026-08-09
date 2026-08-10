import React from 'react';
import {
  Image,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors } from '@/shared/theme/colors';

type Props = {
  /** Photo URL — when omitted, falls back to a solid color chip with `initial`. */
  uri?: string | null;
  initial?: string;
  size?: number;
  /** Explicit corner radius override. Defaults to a TikTok/IG-style squircle scaled from `size`. */
  radius?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle | ImageStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Global Avatar — squircle (rounded-corner square) standard used across the whole app
 * (Inbox, Feed, Comments, Profile, OpenChat) instead of circular avatars, so
 * profile photos / shop logos render fully visible without being cropped into a circle.
 */
function squircleRadius(size: number) {
  return Math.round(Math.min(24, Math.max(12, size * 0.32)));
}

export function Avatar({
  uri,
  initial = '?',
  size = 44,
  radius,
  backgroundColor = colors.brand.primary,
  borderColor = 'rgba(255,255,255,0.22)',
  borderWidth = 1.5,
  style,
  textStyle,
}: Props) {
  const r = radius ?? squircleRadius(size);
  const shared = {
    width: size,
    height: size,
    borderRadius: r,
    borderWidth,
    borderColor,
  } as const;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[shared, style as StyleProp<ImageStyle>]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        shared,
        { backgroundColor, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Text
        style={[
          { color: colors.brand.ink, fontWeight: '900', fontSize: Math.round(size * 0.4) },
          textStyle,
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}
