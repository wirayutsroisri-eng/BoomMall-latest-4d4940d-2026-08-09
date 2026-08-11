import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { AppState } from 'react-native';
import { treeEmoji, type BoomTreeStage } from '../domain/boom-tree';
import { BoomTreeProgressView } from './BoomTreeProgressView';
import { colors } from '@/shared/theme/colors';

type Props = {
  stage: BoomTreeStage;
  progress: number;
  rewardReady: boolean;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  onPress?: () => void;
};

export function BoomTreeView({
  stage,
  progress,
  rewardReady,
  size = 'sm',
  showProgress = true,
  onPress,
}: Props) {
  const scale = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);
  const emoji = treeEmoji(stage);
  const fontSize = size === 'lg' ? 42 : size === 'md' ? 28 : 20;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const apply = () => {
      if (reduceMotion || AppState.currentState !== 'active') {
        cancelAnimation(scale);
        scale.value = 1;
        return;
      }
      if (rewardReady) {
        scale.value = withRepeat(
          withSequence(withTiming(1.06, { duration: 520 }), withTiming(1, { duration: 520 })),
          -1,
          false,
        );
      } else {
        cancelAnimation(scale);
        scale.value = withTiming(1, { duration: 200 });
      }
    };
    apply();
    const appSub = AppState.addEventListener('change', apply);
    return () => {
      appSub.remove();
      cancelAnimation(scale);
    };
  }, [rewardReady, reduceMotion, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Boom Tree ${emoji} ความคืบหน้า ${Math.trunc(progress)} เปอร์เซ็นต์`}
      hitSlop={6}
      style={styles.wrap}
    >
      <Animated.Text style={[{ fontSize }, animStyle]}>{emoji}</Animated.Text>
      {showProgress ? (
        <View style={styles.progressWrap}>
          {size === 'sm' ? (
            <Text style={styles.pct}>{Math.trunc(progress)}%</Text>
          ) : (
            <BoomTreeProgressView progress={progress} />
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  progressWrap: {
    marginTop: 2,
    minWidth: 36,
    alignItems: 'center',
  },
  pct: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brand.primaryDark,
  },
});
