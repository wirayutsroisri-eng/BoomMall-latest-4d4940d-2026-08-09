import React, { useMemo } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { DEFAULT_GP_BPS, sellerMoneyFromOrders } from '@/modules/store/domain/seller-earnings';
import { requestedWithdrawTotal, useSellerWithdrawStore } from '@/modules/store/state/seller-withdraw-store';
import {
  countAwaitingReturn,
  countAwaitingShipment,
  sumDeliveredSales,
} from '@/modules/store/domain/seller-ops';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { jumpToChatInbox } from '@/shared/navigation/safeNavigate';
import { colors } from '@/shared/theme/colors';

const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 16;
const GAP = 10;
const TILE_W = (SCREEN_W - H_PAD * 2 - GAP) / 2;

type Tile = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  badge?: number;
  onPress: () => void;
};

/** โมดูลร้านขายของที่เกาะบนโปรไฟล์ — เฉพาะงานหลังร้าน ไม่รวมประวัติซื้อ/ดูของลูกค้า */
export function ShopModulePanel() {
  const myShopId = useAuthStore((s) => s.user?.shopId ?? '');
  const incomingOrders = useOrdersStore((s) => s.incomingOrders);
  const withdrawHeld = useSellerWithdrawStore((s) => requestedWithdrawTotal(s.requests));
  const ledgerCount = useInventoryStore((s) => s.ledger.length);
  const masters = useInventoryStore((s) => s.masters);
  const customerUnread = useChatStore((s) =>
    s.conversations
      .filter((c) => c.inboxRole === 'seller' || c.kind === 'official')
      .reduce((n, c) => n + (c.isArchived ? 0 : c.unread), 0),
  );

  const myProductCount = useMemo(
    () => masters.filter((m) => m.ownerShopId === myShopId).length,
    [masters, myShopId],
  );
  const shipCount = useMemo(() => countAwaitingShipment(incomingOrders), [incomingOrders]);
  const returnCount = useMemo(() => countAwaitingReturn(incomingOrders), [incomingOrders]);
  const deliveredTotal = useMemo(() => sumDeliveredSales(incomingOrders), [incomingOrders]);
  const money = useMemo(() => sellerMoneyFromOrders(incomingOrders, DEFAULT_GP_BPS), [incomingOrders]);
  const withdrawable = Math.max(0, money.available - withdrawHeld);

  const open = (href: Parameters<typeof router.push>[0]) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(href);
  };

  const tiles: Tile[] = [
    {
      key: 'inventory',
      title: 'คลังสินค้า',
      subtitle: `${myProductCount.toLocaleString('th-TH')} สินค้า`,
      icon: 'cube-outline',
      tint: colors.brand.primaryDark,
      onPress: () => open('/store/dashboard'),
    },
    {
      key: 'ship',
      title: 'จัดส่ง',
      subtitle: shipCount ? `${shipCount} รอแพ็ก` : 'แพ็กของและพัสดุ',
      icon: 'bicycle-outline',
      tint: '#F5A524',
      badge: shipCount || undefined,
      onPress: () => open('/store/shipping'),
    },
    {
      key: 'returns',
      title: 'คืนสินค้า',
      subtitle: returnCount ? 'คำขอคืนจากลูกค้า' : 'ยังไม่มีคำขอคืน',
      icon: 'return-down-back-outline',
      tint: '#2E8CFF',
      badge: returnCount || undefined,
      onPress: () => open('/store/returns'),
    },
    {
      key: 'finance',
      title: 'สมุดบัญชี',
      subtitle:
        withdrawable > 0
          ? `พร้อมถอน ฿${withdrawable.toLocaleString('th-TH')}`
          : deliveredTotal > 0
            ? 'ยอดหลังหัก GP · ถอนเงิน'
            : 'สมุดบัญชี · ถอนเงิน',
      icon: 'wallet-outline',
      tint: '#7C3AED',
      onPress: () => open('/store/finance'),
    },
    {
      key: 'ledger',
      title: 'สมุดบัญชีสต็อก',
      subtitle: `${ledgerCount} รายการคลัง`,
      icon: 'book-outline',
      tint: '#0B1F17',
      onPress: () => open('/store/ledger'),
    },
    {
      key: 'chat',
      title: 'แชทลูกค้า',
      subtitle: customerUnread ? 'มีข้อความใหม่ในแท็บแชท' : 'กล่องแชทร้าน',
      icon: 'chatbubbles-outline',
      tint: '#00A86B',
      badge: customerUnread || undefined,
      onPress: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        jumpToChatInbox();
      },
    },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Ionicons name="storefront" size={18} color={colors.brand.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>โมดูลร้านค้า</Text>
          <Text style={styles.bannerSub}>งานขายของ · คลัง · ออเดอร์ · การเงิน</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable key={tile.key} style={styles.tile} onPress={tile.onPress}>
            <View style={[styles.iconWrap, { backgroundColor: `${tile.tint}18` }]}>
              <Ionicons name={tile.icon} size={22} color={tile.tint} />
              {tile.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tile.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileSub} numberOfLines={1}>
              {tile.subtitle}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: H_PAD,
    paddingTop: 14,
    paddingBottom: 32,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.brand.mist,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontWeight: '900', fontSize: 16, color: colors.text.primary },
  bannerSub: { color: colors.text.secondary, fontSize: 12, marginTop: 2, fontWeight: '600' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tile: {
    width: TILE_W,
    minHeight: 110,
    backgroundColor: colors.surface.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.soft,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tileTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  tileSub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
