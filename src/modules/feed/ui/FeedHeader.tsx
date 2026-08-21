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
  onPressMore?: () => void;
};

const TABS: Array<{ key: FeedTab; label: string }> = [
  { key: 'board', label: 'หางาน' },
  { key: 'nearby', label: 'ใกล้คุณ' },
  { key: 'following', label: 'กำลังติดตาม' },
  { key: 'foryou', label: 'สำหรับคุณ' },
];

export function FeedHeader({ tab, onChangeTab, onPressLive, onPressSearch, onPressMore }: Props) {
  const insets = useSafeAreaInsets();
  const onBoard = tab === 'board';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} pointerEvents="box-none">
      <LinearGradient
        colors={
          onBoard
            ? ['rgba(244,247,245,0.96)', 'rgba(244,247,245,0.75)', 'transparent']
            : ['rgba(0,0,0,0.16)', 'rgba(0,0,0,0.08)', 'transparent']
        }
        style={styles.topScrim}
        pointerEvents="none"
      />
      <View style={styles.row}>
        <View style={styles.sideLeft}>
          {onPressLive ? (
            <Pressable onPress={onPressLive} style={styles.iconBtn} hitSlop={8} accessibilityLabel="ไลฟ์">
              <Ionicons
                name="radio-outline"
                size={22}
                color={onBoard ? colors.text.primary : colors.text.inverse}
              />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable key={t.key} onPress={() => onChangeTab(t.key)} style={styles.tab} hitSlop={4}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tabText,
                    onBoard && styles.tabTextOnBoard,
                    active && (onBoard ? styles.tabTextActiveOnBoard : styles.tabTextActive),
                  ]}
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

        <View style={styles.sideRight}>
          <Pressable onPress={onPressSearch} style={styles.iconBtn} hitSlop={8} accessibilityLabel="ค้นหา">
            <Ionicons
              name="search"
              size={22}
              color={onBoard ? colors.text.primary : colors.text.inverse}
            />
          </Pressable>
          {onPressMore ? (
            <Pressable onPress={onPressMore} style={styles.iconBtn} hitSlop={8} accessibilityLabel="ตัวเลือกเพิ่มเติม">
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color={onBoard ? colors.text.primary : colors.text.inverse}
              />
            </Pressable>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>
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
  /** Minimal top scrim, low height, only behind header text/icons. */
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 132,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sideLeft: {
    width: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideRight: {
    width: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    minWidth: 0,
  },
  tab: {
    flexShrink: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  tabText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 4,
  },
  tabTextOnBoard: {
    color: 'rgba(10,22,17,0.55)',
    textShadowRadius: 0,
  },
  tabTextActive: {
    color: colors.text.inverse,
    fontWeight: '900',
    fontSize: 15,
  },
  tabTextActiveOnBoard: {
    color: colors.text.primary,
    fontWeight: '900',
    fontSize: 15,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    width: 18,
    backgroundColor: colors.text.inverse,
    borderRadius: 1.5,
  },
  underlineOnBoard: {
    backgroundColor: colors.brand.primaryDark,
  },
  iconBtn: {
    width: 38,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
