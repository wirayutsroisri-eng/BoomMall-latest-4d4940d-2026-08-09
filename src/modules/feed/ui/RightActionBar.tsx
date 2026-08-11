import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';
import { CoinIcon } from './CoinIcon';
import { SpinningDisc } from './SpinningDisc';
import { formatBoomCoinCount } from '@/modules/wallet/domain/boom-coin';

type Props = {
  authorInitial: string;
  tips: number;
  comments: number;
  shares: number;
  tipped?: boolean;
  saved?: boolean;
  /** TikTok: กำลังติดตามแล้ว → ซ่อนปุ่ม + */
  following?: boolean;
  onAvatar?: () => void;
  /** TikTok: แตะ + ใต้รูป = follow ทันที */
  onFollow?: () => void;
  /** กดทีละ 1 เหรียญ — ไม่เปิดชีตเลือกจำนวน (ซ่อนถ้าไม่ส่ง) */
  onTip?: () => void;
  onComment: () => void;
  onVaultSave: () => void;
  onShare: () => void;
  onCall?: () => void;
  onReport?: () => void;
  /** Open YouTube-style Listen Mode for this clip's sound */
  onMusic?: () => void;
  musicActive?: boolean;
};

function formatCount(n: number) {
  return formatBoomCoinCount(n);
}

export function RightActionBar({
  authorInitial,
  tips,
  comments,
  shares,
  tipped,
  saved,
  following,
  onAvatar,
  onFollow,
  onTip,
  onComment,
  onVaultSave,
  onShare,
  onCall,
  onReport,
  onMusic,
  musicActive,
}: Props) {
  const tipScale = useSharedValue(1);
  const tipStyle = useAnimatedStyle(() => ({ transform: [{ scale: tipScale.value }] }));
  const badgeScale = useSharedValue(following ? 0 : 1);
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: badgeScale.value,
  }));

  useEffect(() => {
    if (following) {
      badgeScale.value = withSequence(
        withSpring(1.25, { damping: 8, stiffness: 280 }),
        withTiming(0, { duration: 220 }),
      );
    } else {
      badgeScale.value = withSpring(1, { damping: 12, stiffness: 220 });
    }
  }, [following, badgeScale]);

  const handleTip = () => {
    if (!onTip) return;
    tipScale.value = withSpring(1.35, { damping: 6, stiffness: 260 }, () => {
      tipScale.value = withSpring(1, { damping: 10 });
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onTip();
  };

  const handleFollowBadge = () => {
    if (following) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onFollow?.();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.avatarWrap}>
        <Pressable
          onPress={onAvatar}
          onLongPress={() => {
            if (!onCall) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onCall();
          }}
          hitSlop={6}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{authorInitial}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={handleFollowBadge}
          hitSlop={8}
          style={styles.followBadgeHit}
          accessibilityLabel="ติดตาม"
          pointerEvents={following ? 'none' : 'auto'}
        >
          <Animated.View style={[styles.followBadge, badgeStyle]}>
            <Ionicons
              name={following ? 'checkmark' : 'add'}
              size={12}
              color={colors.text.inverse}
            />
          </Animated.View>
        </Pressable>
      </View>

      {onTip ? (
        <Pressable onPress={handleTip} style={styles.action} hitSlop={4} accessibilityLabel="เหรียญ">
          <Animated.View style={tipStyle}>
            <CoinIcon size={28} empty active={Boolean(tipped)} />
          </Animated.View>
          <Text style={[styles.label, tipped && styles.tipLabelActive]}>{formatCount(tips)}</Text>
        </Pressable>
      ) : null}

      <Action icon="chatbubble-ellipses" label={formatCount(comments)} onPress={onComment} />
      <Action
        icon={saved ? 'bookmark' : 'bookmark-outline'}
        label="เซฟ"
        color={saved ? colors.accent.vault : colors.text.inverse}
        onPress={onVaultSave}
      />
      <Action icon="arrow-redo-outline" label={formatCount(shares)} onPress={onShare} />
      {onReport ? (
        <Action icon="flag-outline" label="รายงาน" onPress={onReport} />
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
  avatarWrap: {
    width: 40,
    height: ACTION_SLOT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 0,
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
  followBadgeHit: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    zIndex: 2,
  },
  followBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand.pink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.text.inverse,
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
  discSlot: {
    width: 48,
    height: ACTION_SLOT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
});
