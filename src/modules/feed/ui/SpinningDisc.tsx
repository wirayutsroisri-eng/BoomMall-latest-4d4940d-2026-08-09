import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';

type Props = {
  spinning?: boolean;
  onPress?: () => void;
};

/** TikTok-style disc — tap to open BoomMall Listen Mode (long-form music). */
export function SpinningDisc({ spinning = false, onPress }: Props) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 3200, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
    }
  }, [spinning, rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const disc = (
    <View style={styles.wrap}>
      <Animated.View style={[styles.disc, style]}>
        <View style={styles.groove} />
        <View style={styles.label}>
          <View style={styles.hole} />
        </View>
      </Animated.View>
    </View>
  );

  if (!onPress) return disc;

  return (
    <Pressable onPress={onPress} accessibilityLabel="เปิดโหมดฟังเพลง" hitSlop={6}>
      {disc}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 0,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  groove: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  label: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hole: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2A2A2A',
  },
});

