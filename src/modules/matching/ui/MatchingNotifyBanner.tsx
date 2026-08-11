import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMatchingNotifyStore } from '@/modules/matching/state/matching-notify-store';
import { colors } from '@/shared/theme/colors';

const AUTO_DISMISS_MS = 5200;

/**
 * Lightweight in-app stub for provider push notifications after Community Board matching.
 */
export function MatchingNotifyBanner() {
  const banner = useMatchingNotifyStore((s) => s.activeBanner);
  const dismissBanner = useMatchingNotifyStore((s) => s.dismissBanner);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => dismissBanner(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [banner, dismissBanner]);

  if (!banner) return null;

  return (
    <Pressable
      style={styles.wrap}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const conversationId = banner.conversationId;
        dismissBanner();
        if (conversationId) {
          router.push(`/(tabs)/chat/${encodeURIComponent(conversationId)}`);
        } else {
          router.push('/(tabs)/chat');
        }
      }}
    >
      <View style={styles.card}>
        <Text style={styles.title} numberOfLines={1}>
          {banner.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {banner.body}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 54,
    left: 14,
    right: 14,
    zIndex: 40,
  },
  card: {
    backgroundColor: 'rgba(7,20,15,0.94)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.brand.primary,
  },
  title: {
    color: colors.brand.primary,
    fontWeight: '900',
    fontSize: 13,
  },
  body: {
    marginTop: 4,
    color: colors.text.inverse,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
});
