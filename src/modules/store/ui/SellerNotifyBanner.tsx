import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import {
  fetchMyPromotions,
  fetchSellerNotifications,
  markSellerNotificationsRead,
} from '@/modules/store/data/promotionApi';
import { useSellerNotifyStore } from '@/modules/store/state/seller-notify-store';
import { colors } from '@/shared/theme/colors';

const AUTO_DISMISS_MS = 6200;
const POLL_MS = 20_000;

/**
 * Polls seller inbox after admin approves a product promotion.
 */
export function SellerNotifyBanner() {
  const banner = useSellerNotifyStore((s) => s.activeBanner);
  const push = useSellerNotifyStore((s) => s.push);
  const dismissBanner = useSellerNotifyStore((s) => s.dismissBanner);
  const syncPromotedFromIds = useInventoryStore((s) => s.syncPromotedFromIds);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const [notes, promos] = await Promise.all([
          fetchSellerNotifications(true),
          fetchMyPromotions(),
        ]);
        if (cancelled) return;
        syncPromotedFromIds(
          promos.data.filter((p) => p.adStatus === 'active').map((p) => p.productId),
        );
        const unread = notes.data.filter((n) => !n.read);
        if (unread[0]) {
          push({ id: unread[0].id, title: unread[0].title, body: unread[0].body });
        }
      } catch {
        /* offline / API down — keep local inventory as-is */
      }
    };

    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [push, syncPromotedFromIds]);

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
        void markSellerNotificationsRead([banner.id]).catch(() => undefined);
        dismissBanner();
        router.push('/store/dashboard');
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
    zIndex: 42,
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
