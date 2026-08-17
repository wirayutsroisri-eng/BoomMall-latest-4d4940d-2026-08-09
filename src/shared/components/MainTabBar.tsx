import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const onJobs = feedTab === 'board';
  const chatUnread = useChatStore((s) =>
    s.conversations.reduce(
      (n, c) => n + (!c.isArchived && !c.isMuted && !c.isHidden ? c.unread : 0),
      0,
    ),
  );

  if (isChatWindow(pathname)) return null;

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
              accessibilityLabel={onJobs ? 'รับงาน' : 'สร้าง'}
              onPress={onPress}
              style={styles.item}
              hitSlop={8}
            >
              <Ionicons name="camera-outline" size={42} color="#fff" />
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
                size={28}
                radius={8}
                borderWidth={focused ? 1.5 : 0}
                borderColor={colors.text.inverse}
              />
            ) : (
              <View>
                <Ionicons
                  name={iconName}
                  size={28}
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
    fontSize: 12,
    lineHeight: 16,
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
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
