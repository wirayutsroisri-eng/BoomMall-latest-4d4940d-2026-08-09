import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { CoinIcon } from '@/modules/feed/ui/CoinIcon';
import { colors } from '@/shared/theme/colors';
import { formatBoomCoinCount, formatCoinBalance } from '../domain/boom-coin';

export type BoomCoinAmountVariant = 'compact' | 'balance';

type Props = {
  amount: number;
  /**
   * compact — social score / tip count (100 · 12.6K · 3.8M) like followers
   * balance — spendable wallet (100 · 12,580) moves with real spend/top-up
   */
  variant?: BoomCoinAmountVariant;
  /** Optional caption under the value row (e.g. "ได้รับ Coin") */
  label?: string;
  iconSize?: number;
  valueSize?: number;
  active?: boolean;
  /** Animate when amount goes up or down (tips / spend / top-up). */
  animate?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  /** Hide icon when parent already renders one. */
  showIcon?: boolean;
};

/**
 * Shared Boom Coin display: CoinIcon + formatted amount (+ optional label).
 * Keeps 100 and 12,580 visually aligned like follower stats.
 */
export function BoomCoinAmountView({
  amount,
  variant = 'compact',
  label,
  iconSize = 22,
  valueSize = 17,
  active = true,
  animate = true,
  onPress,
  style,
  valueStyle,
  labelStyle,
  showIcon = true,
}: Props) {
  const safe = Math.max(0, Math.trunc(Number.isFinite(amount) ? amount : 0));
  const [display, setDisplay] = useState(safe);
  const fromRef = useRef(safe);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!animate || safe === fromRef.current) {
      setDisplay(safe);
      fromRef.current = safe;
      return;
    }
    if (reduceMotion) {
      setDisplay(safe);
      fromRef.current = safe;
      return;
    }
    const from = fromRef.current;
    const to = safe;
    const start = Date.now();
    const duration = 480;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safe, animate, reduceMotion]);

  const text =
    variant === 'balance' ? formatCoinBalance(display) : formatBoomCoinCount(display);

  const body = (
    <View style={[styles.wrap, style]}>
      <View style={styles.valueRow}>
        {showIcon ? <CoinIcon size={iconSize} active={active} /> : null}
        <Text
          style={[styles.value, { fontSize: valueSize }, valueStyle]}
          numberOfLines={1}
          accessibilityLabel={`${text} Boom Coin`}
        >
          {text}
        </Text>
      </View>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontWeight: '900',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
