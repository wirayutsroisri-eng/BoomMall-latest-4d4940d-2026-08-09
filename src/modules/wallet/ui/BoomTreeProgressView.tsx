import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';

type Props = {
  progress: number;
  compact?: boolean;
};

/** Thin progress bar 0–100% for Boom Tree. */
export function BoomTreeProgressView({ progress, compact }: Props) {
  const p = Math.max(0, Math.min(100, Math.trunc(progress)));
  const width = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    width.value = reduceMotion ? p : withTiming(p, { duration: 420 });
  }, [p, reduceMotion, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View
      style={[styles.track, compact && styles.trackCompact]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: p }}
      accessibilityLabel={`ความคืบหน้า Boom Tree ${p} เปอร์เซ็นต์`}
    >
      <Animated.View style={[styles.fill, fillStyle]} />
      {!compact ? <Text style={styles.label}>{p}%</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.border.soft,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  trackCompact: {
    height: 4,
    width: 36,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 8,
  },
  label: {
    alignSelf: 'center',
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.primary,
  },
});
