import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { useMainTabBarStore } from '@/shared/state/main-tab-bar-store';

const LABELS: Record<string, string> = {
  index: 'หน้าแรก',
  shop: 'ร้านค้า',
  create: '',
  chat: 'แชท',
  profile: 'โปรไฟล์',
};

/** Inbox keeps the tab bar; a thread (and group room) hides it for more chat space. */
export function isChatWindow(pathname: string) {
  const parts = pathname.split('/').filter((p) => p && p !== '(tabs)');
  const i = parts.indexOf('chat');
  if (i < 0) return false;
  const rest = parts.slice(i + 1);
  if (!rest.length || rest[0] === 'index' || rest[0] === 'add-friend') return false;
  return true;
}

export function MainTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const profile = useLoyaltyStore((s) => s.profile);
  const feedTab = useFeedStore((s) => s.tab);
  const hidden = useMainTabBarStore((s) => s.hidden);
  const activeMainChannelId = useMainTabBarStore((s) => s.activeMainChannelId);
  const setHidden = useMainTabBarStore((s) => s.setHidden);
  const requestHomeRefresh = useMainTabBarStore((s) => s.requestHomeRefresh);
  const visibility = useRef(new Animated.Value(1)).current;
  const onJobs = activeMainChannelId === 'jobs' || feedTab === 'board';
  const onSecondhand = activeMainChannelId === 'secondhand';
  const clipsDark = state.routes[state.index]?.name === 'index' && activeMainChannelId === 'clips';
  const activeColor = clipsDark ? '#FFFFFF' : '#168BFF';
  const inactiveColor = clipsDark ? '#8C948F' : '#707A75';
  const chatUnread = useChatStore((s) =>
    s.conversations.reduce(
      (n, c) => n + (!c.isArchived && !c.isMuted && !c.isHidden ? c.unread : 0),
      0,
    ),
  );

  useEffect(() => {
    Animated.timing(visibility, {
      toValue: hidden ? 0 : 1,
      duration: hidden ? 150 : 210,
      useNativeDriver: true,
    }).start();
  }, [hidden, visibility]);

  useEffect(() => {
    setHidden(false);
  }, [pathname, setHidden]);

  if (isChatWindow(pathname)) return null;

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[
        styles.wrap,
        clipsDark && styles.wrapDark,
        {
          height: 44 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          transform: [{
            translateY: visibility.interpolate({
              inputRange: [0, 1],
              outputRange: [44 + Math.max(insets.bottom, 8), 0],
            }),
          }],
        },
      ]}
    >
      {state.routes.map((route: (typeof state.routes)[number], index: number) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const isCreate = route.name === 'create';

        const onPress = () => {
          setHidden(false);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (route.name === 'index' && !event.defaultPrevented) {
            requestHomeRefresh();
            if (focused) return;
          }
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
              accessibilityLabel={onJobs ? 'สร้างประกาศงาน' : onSecondhand ? 'ลงขายสินค้ามือสอง' : 'สร้างคอนเทนต์'}
              onPress={onPress}
              style={styles.item}
              hitSlop={8}
            >
              <View style={styles.createButton}>
                <View style={[styles.createRing, clipsDark && styles.createRingDark]}>
                  <View style={styles.createCore}>
                    <Ionicons name="add" size={27} color={clipsDark ? '#fff' : '#202824'} />
                  </View>
                </View>
              </View>
              <Text style={[styles.label, styles.createLabelSpacer]}>.</Text>

            </Pressable>
          );
        }

        const iconName = (() => {
          switch (route.name) {
            case 'index':
              return focused ? 'home' : 'home-outline';
            case 'shop':
              return focused ? 'storefront' : 'storefront-outline';
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
                size={22}
                radius={11}
                borderWidth={focused ? 1.5 : 0}
                borderColor={activeColor}
              />
            ) : (
              <View>
                <Ionicons
                  name={iconName}
                  size={20}
                  color={focused ? activeColor : inactiveColor}
                />

                {route.name === 'chat' && chatUnread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {chatUnread > 9 ? '9+' : String(chatUnread)}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
            <Text style={[styles.label, clipsDark && styles.labelDark, focused && styles.labelActive, focused && clipsDark && styles.labelActiveDark]}>
              {LABELS[route.name] ?? route.name}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F4F5F3',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D7DCD8',
    paddingTop: 0,
    paddingHorizontal: 4,
  },
  wrapDark: { backgroundColor: '#000', borderTopColor: '#202420' },
  item: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: '#707A75',
  },
  createLabelSpacer: {
    opacity: 0,
    height: 0,
  },
  createButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 11 },
  createRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: '#202824', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  createRingDark: { borderColor: '#fff' },
  createCore: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  labelActive: {
    color: '#168BFF',
    fontWeight: '800',
  },
  labelDark: { color: '#8C948F' },
  labelActiveDark: { color: '#fff' },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});
