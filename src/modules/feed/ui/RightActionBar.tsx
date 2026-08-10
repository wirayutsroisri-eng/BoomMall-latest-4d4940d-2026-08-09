import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';
import { SpinningDisc } from './SpinningDisc';

type Props = {
  authorInitial: string;
  likes: number;
  comments: number;
  shares: number;
  liked?: boolean;
  saved?: boolean;
  onAvatar?: () => void;
  onLike: () => void;
  onComment: () => void;
  onVaultSave: () => void;
  onShare: () => void;
  onQuickBuy: () => void;
  onCall: () => void;
};

function formatCount(n: number) {
  if (n >= 100000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function RightActionBar({
  authorInitial,
  likes,
  comments,
  shares,
  liked,
  saved,
  onAvatar,
  onLike,
  onComment,
  onVaultSave,
  onShare,
  onQuickBuy,
  onCall,
}: Props) {
  const scale = useSharedValue(1);
  const likeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleLike = () => {
    scale.value = withSpring(1.35, { damping: 6, stiffness: 260 }, () => {
      scale.value = withSpring(1, { damping: 10 });
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLike();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={onAvatar}
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onCall();
        }}
        style={styles.avatarWrap}
        hitSlop={6}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{authorInitial}</Text>
        </View>
        <View style={styles.followBadge}>
          <Ionicons name="add" size={12} color={colors.text.inverse} />
        </View>
      </Pressable>

      <Action
        icon={liked ? 'heart' : 'heart-outline'}
        label={formatCount(likes)}
        color={liked ? colors.accent.live : colors.text.inverse}
        onPress={handleLike}
        animatedStyle={likeStyle}
      />
      <Action icon="chatbubble-ellipses" label={formatCount(comments)} onPress={onComment} />
      <Action
        icon={saved ? 'bookmark' : 'bookmark-outline'}
        label="เซฟ"
        color={saved ? colors.accent.vault : colors.text.inverse}
        onPress={onVaultSave}
      />
      <Action icon="arrow-redo-outline" label={formatCount(shares)} onPress={onShare} />

      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          onQuickBuy();
        }}
        style={styles.action}
        hitSlop={4}
      >
        <View style={styles.buyCircle}>
          <Ionicons name="bag-handle" size={19} color={colors.brand.ink} />
        </View>
        <Text style={styles.label}>ซื้อ</Text>
      </Pressable>

      <SpinningDisc />
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  color = colors.text.inverse,
  animatedStyle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  animatedStyle?: object;
}) {
  return (
    <Pressable onPress={onPress} style={styles.action} hitSlop={4}>
      <Animated.View style={animatedStyle}>
        <Ionicons name={icon} size={28} color={color} style={styles.iconShadow} />
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 8,
    bottom: 18,
    alignItems: 'center',
    gap: 10,
    zIndex: 15,
  },
  avatarWrap: {
    marginBottom: 2,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.text.inverse,
  },
  avatarText: {
    fontWeight: '900',
    color: colors.brand.ink,
    fontSize: 15,
  },
  followBadge: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.text.inverse,
  },
  action: {
    alignItems: 'center',
    gap: 3,
  },
  iconShadow: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  label: {
    color: colors.text.inverse,
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  buyCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand.primary,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
