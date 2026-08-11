import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  SEARCH_RADIUS_OPTIONS,
  formatSearchRadiusLabel,
  type SearchRadiusOption,
} from '@/modules/matching/domain/search-radius';
import { colors } from '@/shared/theme/colors';

type Props = {
  value: SearchRadiusOption;
  onChange: (value: SearchRadiusOption) => void;
  hint?: string;
};

const INDEX_VALUES = SEARCH_RADIUS_OPTIONS.map((o) => o.value);

function indexOf(value: SearchRadiusOption) {
  const i = INDEX_VALUES.indexOf(value);
  return i >= 0 ? i : 2; // default 10 km
}

/**
 * Interactive discrete radius slider: 3 · 5 · 10 · 25 · 50 · ทั้งพื้นที่
 */
export function SearchRadiusSlider({ value, onChange, hint }: Props) {
  const index = indexOf(value);
  const label = formatSearchRadiusLabel(value);
  const ticks = useMemo(() => SEARCH_RADIUS_OPTIONS.map((o) => o.label), []);

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Ionicons name="navigate-circle-outline" size={22} color={colors.text.primary} />
        <View style={styles.headerText}>
          <Text style={styles.title}>รัศมีค้นหา · {label}</Text>
          <Text style={styles.hint}>
            {hint ?? 'ลากเพื่อกำหนดระยะจับคู่ช่าง/งานรอบจันทบุรี'}
          </Text>
        </View>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={INDEX_VALUES.length - 1}
        step={1}
        value={index}
        minimumTrackTintColor={colors.brand.primaryDark}
        maximumTrackTintColor={colors.border.soft}
        thumbTintColor={colors.brand.primary}
        onValueChange={(v) => {
          const next = INDEX_VALUES[Math.round(v)];
          if (next !== undefined && next !== value) {
            void Haptics.selectionAsync();
            onChange(next);
          }
        }}
      />
      <View style={styles.tickRow}>
        {ticks.map((t, i) => (
          <Text key={t} style={[styles.tick, i === index && styles.tickActive]}>
            {t.replace(' กม.', '')}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingVertical: 10,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text.primary,
    fontWeight: '800',
    fontSize: 15,
  },
  hint: {
    color: colors.text.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  slider: {
    width: '100%',
    height: 36,
  },
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  tick: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
  },
  tickActive: {
    color: colors.brand.primaryDark,
  },
});
