import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/shared/theme/colors';
import type { FeedTab } from '@/modules/feed/domain/types';

type Props = {
  tab: FeedTab;
  onChangeTab: (tab: FeedTab) => void;
  onPressLive?: () => void;
  onPressSearch?: () => void;
};

const TABS: Array<{ key: FeedTab; label: string }> = [
  { key: 'nearby', label: 'ใกล้คุณ' },
  { key: 'following', label: 'กำลังติดตาม' },
  { key: 'foryou', label: 'สำหรับคุณ' },
];

export function FeedHeader({ tab, onChangeTab, onPressLive, onPressSearch }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(0,0,0,0.4)', 'transparent']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.row}>
        <Pressable onPress={onPressLive} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="radio-outline" size={20} color={colors.text.inverse} />
        </Pressable>

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable key={t.key} onPress={() => onChangeTab(t.key)} style={styles.tab} hitSlop={6}>
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                  {t.label}
                </Text>
                {active ? <View style={styles.underline} /> : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={onPressSearch} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="search" size={20} color={colors.text.inverse} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 2,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  tab: {
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingBottom: 7,
    maxWidth: 110,
  },
  tabText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 3,
  },
  tabTextActive: {
    color: colors.text.inverse,
    fontWeight: '800',
    fontSize: 14,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    height: 2,
    width: 18,
    marginLeft: -9,
    backgroundColor: colors.text.inverse,
    borderRadius: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
