import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';
import { SpinningDisc } from './SpinningDisc';

type Props = {
  tips: number;
  comments: number;
  tipped?: boolean;
  /** กดทีละ 1 เหรียญ — ไม่เปิดชีตเลือกจำนวน (ซ่อนถ้าไม่ส่ง) */
  onTip?: () => void;
  onComment: () => void;
  onShare?: () => void;
  shares?: number;
  onLike?: () => void;
  liked?: boolean;
  likes?: number;
  /** Open YouTube-style Listen Mode for this clip's sound */
  onMusic?: () => void;
  musicActive?: boolean;
  bottomOffset?: number;
};

function formatCount(n: number) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function RightActionBar({
  tips,
  comments,
  tipped,
  onTip,
  onComment,
  onShare,
  shares,
  onLike,
  liked,
  likes,
  onMusic,
  musicActive,
  bottomOffset = 0,
}: Props) {
  const likeScale = useSharedValue(1);
  const likeStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));

  const handleLike = () => {
    if (!onLike) return;
    likeScale.value = withSpring(1.35, { damping: 6, stiffness: 260 }, () => {
      likeScale.value = withSpring(1, { damping: 10 });
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLike();
  };

  return (
    <View style={[styles.wrap, { bottom: 18 + bottomOffset }]} pointerEvents="box-none">
      {onLike ? (
        <Pressable onPress={handleLike} style={styles.action} hitSlop={10} accessibilityLabel="ถูกใจ">
          <Animated.View style={likeStyle}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={28}
              color={liked ? colors.brand.pink : colors.text.inverse}
              style={styles.iconShadow}
            />

          </Animated.View>
          <Text style={[styles.label, liked && styles.likeLabelActive]}>
            {formatCount(likes ?? 0)}
          </Text>
        </Pressable>
      ) : null}

      <Action icon="chatbubble-ellipses" label={formatCount(comments)} onPress={onComment} />
      {onShare ? (
        <Action
          icon="arrow-redo-outline"
          label={formatCount(shares ?? 0)}
          onPress={() => {
            void Haptics.selectionAsync();
            onShare();
          }}
        />
      ) : null}

      {onMusic ? (
        <View style={styles.discSlot}>
          <SpinningDisc spinning={Boolean(musicActive)} onPress={onMusic} />
        </View>
      ) : null}
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
    <Pressable onPress={onPress} style={styles.action} hitSlop={10}>
      <Animated.View style={animatedStyle}>
        <Ionicons name={icon} size={28} color={color} style={styles.iconShadow} />
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const ACTION_GAP = 12;
const ICON_LABEL_GAP = 3;
const ACTION_SLOT = 52;


const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 8,
    bottom: 18,
    alignItems: 'center',
    gap: ACTION_GAP,
    zIndex: 15,
  },
  action: {
    width: 48,
    height: ACTION_SLOT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: ICON_LABEL_GAP,
  },
  iconShadow: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  label: {
    color: colors.text.inverse,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },

  tipLabelActive: {
    color: colors.accent.warning,
  },
  likeLabelActive: {
    color: colors.brand.pink,
  },
  discSlot: {
    width: 48,
    height: ACTION_SLOT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
});
