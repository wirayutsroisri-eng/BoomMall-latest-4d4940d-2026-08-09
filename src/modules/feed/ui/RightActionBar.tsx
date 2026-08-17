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
import { CoinIcon } from './CoinIcon';
import { SpinningDisc } from './SpinningDisc';
import { formatBoomCoinCount } from '@/modules/wallet/domain/boom-coin';

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
};

function formatCount(n: number) {
  return formatBoomCoinCount(n);
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
}: Props) {
  const tipScale = useSharedValue(1);
  const tipStyle = useAnimatedStyle(() => ({ transform: [{ scale: tipScale.value }] }));
  const likeScale = useSharedValue(1);
  const likeStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }));

  const handleTip = () => {
    if (!onTip) return;
    tipScale.value = withSpring(1.35, { damping: 6, stiffness: 260 }, () => {
      tipScale.value = withSpring(1, { damping: 10 });
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onTip();
  };

  const handleLike = () => {
    if (!onLike) return;
    likeScale.value = withSpring(1.35, { damping: 6, stiffness: 260 }, () => {
      likeScale.value = withSpring(1, { damping: 10 });
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLike();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {onTip ? (
        <Pressable onPress={handleTip} style={styles.action} hitSlop={4} accessibilityLabel="เหรียญ">
          <Animated.View style={tipStyle}>
            <CoinIcon size={28} empty active={Boolean(tipped)} />
          </Animated.View>
          <Text style={[styles.label, tipped && styles.tipLabelActive]}>{formatCount(tips)}</Text>
        </Pressable>
      ) : null}

      {onLike ? (
        <Pressable onPress={handleLike} style={styles.action} hitSlop={4} accessibilityLabel="ถูกใจ">
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

      <View style={styles.discSlot}>
        <SpinningDisc spinning={musicActive !== false} onPress={onMusic} />
      </View>
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

const ACTION_GAP = 12;
const ICON_LABEL_GAP = 4;
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
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
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
