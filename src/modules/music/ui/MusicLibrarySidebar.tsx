import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/shared/theme/colors';

export type MusicLibraryTab = 'all' | 'pinned' | 'history' | 'frequent';

type Item = {
  key: MusicLibraryTab | 'add';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const ITEMS: Item[] = [
  { key: 'all', label: 'ทั้งหมด', icon: 'musical-notes-outline' },
  { key: 'pinned', label: 'ปักหมุด', icon: 'pin-outline' },
  { key: 'history', label: 'ประวัติชม', icon: 'time-outline' },
  { key: 'frequent', label: 'เล่นบ่อย', icon: 'flame-outline' },
  { key: 'add', label: 'เพิ่ม', icon: 'add' },
];

type Props = {
  active: MusicLibraryTab;
  onChange: (tab: MusicLibraryTab) => void;
  onAdd?: () => void;
};

/** Compact horizontal tab bar for Listen library filters + add. */
export function MusicLibrarySidebar({ active, onChange, onAdd }: Props) {
  const items = ITEMS.filter((item) => item.key !== 'add' || Boolean(onAdd));
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((item) => {
          const selected = item.key !== 'add' && item.key === active;
          return (
            <Pressable
              key={item.key}
              style={[styles.chip, selected && styles.chipActive, item.key === 'add' && styles.chipAdd]}
              onPress={() => {
                void Haptics.selectionAsync();
                if (item.key === 'add') onAdd?.();
                else onChange(item.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
            >
              <Ionicons
                name={
                  item.key === 'pinned' && selected
                    ? 'pin'
                    : item.key === 'frequent' && selected
                      ? 'flame'
                      : item.icon
                }
                size={15}
                color={
                  item.key === 'add'
                    ? colors.brand.ink
                    : selected
                      ? colors.brand.primary
                      : 'rgba(255,255,255,0.75)'
                }
              />
              <Text
                style={[
                  styles.label,
                  selected && styles.labelActive,
                  item.key === 'add' && styles.labelAdd,
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 4,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'rgba(0,214,143,0.14)',
    borderColor: 'rgba(0,214,143,0.4)',
  },
  chipAdd: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  label: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '800',
  },
  labelActive: {
    color: colors.brand.primary,
  },
  labelAdd: {
    color: colors.brand.ink,
  },
});
