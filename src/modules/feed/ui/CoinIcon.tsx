import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/shared/theme/colors';

type Props = {
  size?: number;
  /** Filled = given; empty = outline coin with no value styling */
  active?: boolean;
  /** Hollow coin — no fill, no “B value” look */
  empty?: boolean;
};

/** เหรียญบนฟีด — โหมด empty = เหรียญเปล่า ไม่สื่อมูลค่าเงิน */
export function CoinIcon({ size = 28, active = false, empty = false }: Props) {
  if (empty) {
    const stroke = active ? '#F5D76E' : 'rgba(255,255,255,0.92)';
    return (
      <View
        style={[
          styles.coin,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: 'transparent',
            borderColor: stroke,
            borderWidth: Math.max(2, size * 0.08),
          },
        ]}
      />
    );
  }

  const border = active ? '#F5D76E' : colors.accent.warning;
  const fill = active ? colors.accent.vault : 'rgba(201,162,39,0.28)';
  const ink = active ? '#1A1408' : colors.accent.warning;

  return (
    <View
      style={[
        styles.coin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: fill,
          borderColor: border,
        },
      ]}
    >
      <Text style={[styles.mark, { fontSize: size * 0.48, color: ink }]}>B</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  coin: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  mark: {
    fontWeight: '900',
    marginTop: -1,
  },
});
