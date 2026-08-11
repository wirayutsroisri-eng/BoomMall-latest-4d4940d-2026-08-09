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
  { key: 'board', label: 'เว็บบอร์ด' },
  { key: 'nearby', label: 'ใกล้คุณ' },
  { key: 'following', label: 'กำลังติดตาม' },
  { key: 'foryou', label: 'สำหรับคุณ' },
];

export function FeedHeader({ tab, onChangeTab, onPressLive, onPressSearch }: Props) {
  const insets = useSafeAreaInsets();
  const onBoard = tab === 'board';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} pointerEvents="box-none">
      <LinearGradient
        colors={
          onBoard
            ? ['rgba(244,247,245,0.96)', 'rgba(244,247,245,0.75)', 'transparent']
            : ['rgba(0,0,0,0.4)', 'transparent']
        }
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.row}>
        {onPressLive ? (
          <Pressable onPress={onPressLive} style={styles.iconBtn} hitSlop={8}>
            <Ionicons
              name="radio-outline"
              size={20}
              color={onBoard ? colors.text.primary : colors.text.inverse}
            />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable key={t.key} onPress={() => onChangeTab(t.key)} style={styles.tab} hitSlop={4}>
                <Text
                  style={[
                    styles.tabText,
                    onBoard && styles.tabTextOnBoard,
                    active && (onBoard ? styles.tabTextActiveOnBoard : styles.tabTextActive),
                  ]}
                  numberOfLines={1}
                >
                  {t.label}
                </Text>
                {active ? (
                  <View style={[styles.underline, onBoard && styles.underlineOnBoard]} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={onPressSearch} style={styles.iconBtn} hitSlop={8}>
          <Ionicons
            name="search"
            size={20}
            color={onBoard ? colors.text.primary : colors.text.inverse}
          />
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
    paddingHorizontal: 2,
    paddingVertical: 6,
    gap: 0,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  tab: {
    alignItems: 'center',
    paddingHorizontal: 1,
    paddingBottom: 7,
    maxWidth: 88,
  },
  tabText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 3,
  },
  tabTextOnBoard: {
    color: 'rgba(10,22,17,0.55)',
    textShadowRadius: 0,
  },
  tabTextActive: {
    color: colors.text.inverse,
    fontWeight: '800',
    fontSize: 13,
  },
  tabTextActiveOnBoard: {
    color: colors.text.primary,
    fontWeight: '900',
    fontSize: 13,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    height: 2,
    width: 16,
    marginLeft: -8,
    backgroundColor: colors.text.inverse,
    borderRadius: 1,
  },
  underlineOnBoard: {
    backgroundColor: colors.brand.primaryDark,
  },
  iconBtn: {
    width: 30,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
