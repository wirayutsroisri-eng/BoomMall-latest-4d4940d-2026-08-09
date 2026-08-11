import React from 'react';
import { StyleSheet } from 'react-native';
import { BoomCoinAmountView } from './BoomCoinAmountView';
import { colors } from '@/shared/theme/colors';

type Props = {
  balance: number;
  /** Bumps when a claim animation should run. */
  animToken?: number;
  size?: 'sm' | 'md' | 'lg';
  /** On dark wallet hero card use light. */
  tone?: 'default' | 'onDark';
  /** When false, render number only (use with CoinIcon). */
  showSymbol?: boolean;
};

/** Displays spendable Boom Coin balance with live up/down animation. */
export function BoomCoinBalanceView({
  balance,
  animToken = 0,
  size = 'sm',
  tone = 'default',
  showSymbol = true,
}: Props) {
  const valueSize = size === 'lg' ? 28 : size === 'md' ? 18 : 13;
  const iconSize = size === 'lg' ? 28 : size === 'md' ? 20 : 16;

  return (
    <BoomCoinAmountView
      key={animToken}
      amount={balance}
      variant="balance"
      showIcon={showSymbol}
      iconSize={iconSize}
      valueSize={valueSize}
      animate
      valueStyle={tone === 'onDark' ? styles.onDark : undefined}
    />
  );
}

const styles = StyleSheet.create({
  onDark: {
    color: colors.brand.primary,
  },
});
