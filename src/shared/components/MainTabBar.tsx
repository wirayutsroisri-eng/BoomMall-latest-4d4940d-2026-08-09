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
  const setHidden = useMainTabBarStore((s) => s.setHidden);
  const visibility = useRef(new Animated.Value(1)).current;
  const onJobs = feedTab === 'board';
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
              accessibilityLabel={onJobs ? 'รับงาน' : 'สร้าง'}
              onPress={onPress}
              style={styles.item}
              hitSlop={8}
            >
              <Ionicons name="camera-outline" size={30} color="#fff" />
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
                size={20}
                radius={7}
                borderWidth={focused ? 1.5 : 0}
                borderColor={colors.text.inverse}
              />
            ) : (
              <View>
                <Ionicons
                  name={iconName}
                  size={20}
                  color={focused ? colors.text.inverse : 'rgba(255,255,255,0.5)'}
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
            <Text style={[styles.label, focused && styles.labelActive]}>
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
    backgroundColor: colors.brand.ink,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 0,
    paddingHorizontal: 4,
  },
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
    color: 'rgba(255,255,255,0.55)',
  },
  createLabelSpacer: {
    opacity: 0,
  },
  labelActive: {
    color: colors.text.inverse,
    fontWeight: '800',
  },
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
