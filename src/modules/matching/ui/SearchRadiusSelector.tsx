import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  SEARCH_RADIUS_OPTIONS,
  type SearchRadiusOption,
} from '@/modules/matching/domain/search-radius';
import { colors } from '@/shared/theme/colors';

type Props = {
  value: SearchRadiusOption;
  onChange: (value: SearchRadiusOption) => void;
  /** Compact subtitle under the title */
  hint?: string;
};

/**
 * Chip row for preferred Community Board search radius on create/publish screens.
 */
export function SearchRadiusSelector({ value, onChange, hint }: Props) {
  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Ionicons name="navigate-outline" size={20} color={colors.text.primary} />
        <View style={styles.headerText}>
          <Text style={styles.title}>รัศมีค้นหาช่าง / งาน</Text>
          <Text style={styles.hint}>
            {hint ?? 'ระบบจับคู่เฉพาะผู้รับบริการในระยะที่เลือก'}
          </Text>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {SEARCH_RADIUS_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <Pressable
              key={String(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(opt.value);
              }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingVertical: 12,
    gap: 10,
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
  chipRow: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  chipActive: {
    backgroundColor: colors.brand.ink,
    borderColor: colors.brand.primary,
  },
  chipText: {
    color: colors.text.secondary,
    fontWeight: '700',
    fontSize: 13,
  },
  chipTextActive: {
    color: colors.brand.primary,
  },
});
