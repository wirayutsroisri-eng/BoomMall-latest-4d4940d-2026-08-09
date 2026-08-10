import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';

const LABELS: Record<string, string> = {
  index: 'หน้าแรก',
  shop: 'ร้านค้า',
  create: '',
  chat: 'แชท',
  profile: 'โปรไฟล์',
};

export function MainTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const profile = useLoyaltyStore((s) => s.profile);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route: (typeof state.routes)[number], index: number) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const isCreate = route.name === 'create';

        const onPress = () => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        if (isCreate) {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              style={styles.createHit}
              hitSlop={8}
            >
              <View style={styles.createWrap}>
                <View style={styles.createBarCyan} />
                <View style={styles.createBarPink} />
                <View style={styles.createBtn}>
                  <Ionicons name="camera" size={22} color={colors.text.inverse} />
                </View>
              </View>
            </Pressable>
          );
        }

        const iconName = (() => {
          switch (route.name) {
            case 'index':
              return focused ? 'home' : 'home-outline';
            case 'shop':
              return focused ? 'compass' : 'compass-outline';
            case 'chat':
              return focused ? 'chatbubble' : 'chatbubble-outline';
            default:
              return 'ellipse';
          }
        })() as keyof typeof Ionicons.glyphMap;

        const isProfile = route.name === 'profile';

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={styles.item}
          >
            {isProfile ? (
              <Avatar
                uri={profile.avatarUri}
                initial={profile.displayName.slice(0, 1)}
                size={26}
                radius={8}
                borderWidth={focused ? 1.5 : 0}
                borderColor={colors.text.inverse}
              />
            ) : (
              <Ionicons
                name={iconName}
                size={26}
                color={focused ? colors.text.inverse : 'rgba(255,255,255,0.5)'}
              />
            )}
            <Text style={[styles.label, focused && styles.labelActive]}>
              {LABELS[route.name] ?? route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.brand.ink,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  item: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  labelActive: {
    color: colors.text.inverse,
    fontWeight: '800',
  },
  createHit: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createWrap: {
    width: 48,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBarCyan: {
    position: 'absolute',
    left: 5,
    top: -2,
    width: 34,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.brand.cyan,
  },
  createBarPink: {
    position: 'absolute',
    right: 5,
    bottom: -2,
    width: 34,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.brand.pink,
  },
  createBtn: {
    width: 46,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
});
