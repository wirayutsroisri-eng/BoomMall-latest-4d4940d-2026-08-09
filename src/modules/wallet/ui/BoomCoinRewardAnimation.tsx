import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';

type Props = {
  /** Increments when REWARD_CLAIM_CONFIRMED — play once. */
  token: number;
  amount: number;
};

/**
 * Lightweight claim flourish: tree nudge → +N 🪙 → coin floats toward wallet.
 * Does NOT mint coins. Reduce Motion → fade only.
 */
export function BoomCoinRewardAnimation({ token, amount }: Props) {
  const [visible, setVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (token <= 0 || amount < 1) return;
    setVisible(true);
    if (reduceMotion) {
      opacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withDelay(500, withTiming(0, { duration: 200 })),
      );
      const t = setTimeout(() => setVisible(false), 900);
      return () => clearTimeout(t);
    }
    opacity.value = 0;
    translateY.value = 0;
    translateX.value = 0;
    scale.value = 1;
    opacity.value = withSequence(
      withTiming(1, { duration: 160 }),
      withDelay(700, withTiming(0, { duration: 280 })),
    );
    scale.value = withSequence(
      withTiming(1.12, { duration: 180 }),
      withTiming(1, { duration: 180 }),
    );
    translateY.value = withDelay(280, withTiming(-36, { duration: 650 }));
    translateX.value = withDelay(280, withTiming(48, { duration: 650 }));
    const t = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(t);
  }, [token, amount, reduceMotion, opacity, translateX, translateY, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.Text style={[styles.coin, style]}>+{amount} 🪙</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  coin: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.accent.vault,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowRadius: 4,
  },
});
