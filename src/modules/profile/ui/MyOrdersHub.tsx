import React, { useMemo } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useCartStore } from '@/modules/commerce/state/cart-store';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import type { OrderStatus } from '@/modules/store/domain/types';
import { colors } from '@/shared/theme/colors';
import {
  ENABLE_COMING_SOON_SHOP_CHROME,
  ENABLE_PAYLATER_AND_CREDIT_UI,
} from '@/shared/compliance/appStoreGates';

const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 12;
const COL_W = (SCREEN_W - H_PAD * 2 - 8) / 2;

export type OrdersListFilter =
  | 'all'
  | 'pending'
  | 'paid'
  | 'shipped'
  | 'review'
  | 'returns';

const STATUS_SHORTCUTS: Array<{
  key: OrdersListFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: (status: OrderStatus, needsReview?: boolean) => boolean;
}> = [
  {
    key: 'pending',
    label: 'รอชำระเงิน',
    icon: 'wallet-outline',
    match: (s) => s === 'pending',
  },
  {
    key: 'paid',
    label: 'รอจัดส่ง',
    icon: 'document-text-outline',
    match: (s) => s === 'paid',
  },
  {
    key: 'shipped',
    label: 'รอรับ',
    icon: 'car-outline',
    match: (s) => s === 'shipped',
  },
  {
    key: 'review',
    label: 'รอรีวิว',
    icon: 'star-outline',
    match: (s, needsReview) => s === 'delivered' && !!needsReview,
  },
  {
    key: 'returns',
    label: 'การคืนสินค้า',
    icon: 'cube-outline',
    match: (s) => s === 'cancelled',
  },
];

const TOOLS_ALL: Array<{
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  dot?: boolean;
}> = [
  { key: 'cart', label: 'รถเข็น', icon: 'cart-outline' },
  { key: 'coupons', label: 'คูปอง', icon: 'ticket-outline' },
  { key: 'bonus', label: 'โบนัส', icon: 'diamond-outline' },
  { key: 'samples', label: 'ตัวอย่าง', icon: 'gift-outline', dot: true },
  { key: 'paylater', label: 'PayLater', icon: 'card-outline' },
  { key: 'fav', label: 'รายการโปรด', icon: 'bookmark-outline' },
  { key: 'address', label: 'สมุดที่อยู่', icon: 'book-outline' },
];

const TOOLS = TOOLS_ALL.filter((t) => {
  if (t.key === 'paylater' && !ENABLE_PAYLATER_AND_CREDIT_UI) return false;
  if (
    !ENABLE_COMING_SOON_SHOP_CHROME &&
    (t.key === 'coupons' ||
      t.key === 'bonus' ||
      t.key === 'samples' ||
      t.key === 'paylater' ||
      t.key === 'fav' ||
      t.key === 'address')
  ) {
    return false;
  }
  return true;
});

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

function openList(filter: OrdersListFilter = 'all') {
  void Haptics.selectionAsync();
  router.push({ pathname: '/orders', params: { filter } });
}

/** หน้าต่างที่ 1 — ภาพรวมคำสั่งซื้อ (ในแท็บถุงของโปรไฟล์) */
export function MyOrdersHub() {
  const myOrders = useOrdersStore((s) => s.myOrders);
  const masters = useInventoryStore((s) => s.masters);
  const lines = useCartStore((s) => s.lines);
  const lineCount = lines.reduce((n, l) => n + l.qty, 0);

  const counts = useMemo(() => {
    const map: Record<OrdersListFilter, number> = {
      all: myOrders.length,
      pending: 0,
      paid: 0,
      shipped: 0,
      review: 0,
      returns: 0,
    };
    for (const o of myOrders) {
      for (const sc of STATUS_SHORTCUTS) {
        if (sc.match(o.status, o.needsReview)) map[sc.key] += 1;
      }
    }
    return map;
  }, [myOrders]);

  const spotlight =
    myOrders.find((o) => o.status === 'shipped') ??
    myOrders.find((o) => o.status === 'paid') ??
    myOrders[0];

  const recommend = masters.slice(0, 6);

  return (
    <View style={styles.root}>
      {/* Window 1 header card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>คำสั่งซื้อของคุณ</Text>
          <Pressable style={styles.seeAll} onPress={() => openList('all')} hitSlop={8}>
            <Text style={styles.seeAllText}>ดูทั้งหมด</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          {STATUS_SHORTCUTS.map((sc) => {
            const count = counts[sc.key];
            return (
              <Pressable key={sc.key} style={styles.statusItem} onPress={() => openList(sc.key)}>
                <View style={styles.statusIconWrap}>
                  <Ionicons name={sc.icon} size={24} color={colors.text.primary} />
                  {count > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.statusLabel} numberOfLines={1}>
                  {sc.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {spotlight ? (
          <Pressable style={styles.spotlight} onPress={() => openList(spotlight.status === 'cancelled' ? 'returns' : spotlight.status === 'delivered' ? 'review' : spotlight.status)}>
            {spotlight.imageUri ? (
              <Image source={{ uri: spotlight.imageUri }} style={styles.spotlightThumb} />
            ) : (
              <View style={[styles.spotlightThumb, { backgroundColor: spotlight.thumbnailColor }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.spotlightTitle} numberOfLines={1}>
                {spotlight.shippingHeadline ?? 'อัปเดตคำสั่งซื้อ'}
              </Text>
              <Text style={styles.spotlightBody} numberOfLines={2}>
                {spotlight.shippingDetail ?? spotlight.productTitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Tools row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolsRow}
      >
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.key}
            style={styles.toolItem}
            onPress={() => {
              void Haptics.selectionAsync();
              if (tool.key === 'cart') router.push('/shop/cart');
              else if (tool.key === 'fav') {
                /* stay on profile liked/saved — hint only */
              }
            }}
          >
            <View style={styles.toolIcon}>
              <Ionicons name={tool.icon} size={22} color={colors.text.primary} />
              {tool.key === 'cart' && lineCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{lineCount > 99 ? '99+' : lineCount}</Text>
                </View>
              ) : null}
              {tool.dot ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.toolLabel} numberOfLines={1}>
              {tool.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Recommendations */}
      <Text style={styles.sectionTitle}>คุณยังอาจชอบ</Text>
      <View style={styles.grid}>
        {recommend.map((m, index) => {
          const price = m.basePrice;
          const compare = Math.round(price * 1.35);
          const isVideo = index % 2 === 0;
          return (
            <Pressable
              key={m.id}
              style={styles.productCard}
              onPress={() => router.push('/(tabs)/shop')}
            >
              <View style={styles.productVisual}>
                <Image
                  source={{ uri: m.imageUri ?? masterContentImage(m.id) }}
                  style={styles.productImage}
                />
                {isVideo ? (
                  <View style={styles.duration}>
                    <Text style={styles.durationText}>00:59</Text>
                  </View>
                ) : (
                  <View style={styles.offBadge}>
                    <Text style={styles.offBadgeText}>-35%</Text>
                  </View>
                )}
                <View style={styles.adBadge}>
                  <Text style={styles.adBadgeText}>Ad</Text>
                </View>
              </View>
              <View style={styles.productBody}>
                <Text style={styles.productTitle} numberOfLines={2}>
                  {m.title}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={styles.salePrice}>{formatTHB(price)}</Text>
                  <Text style={styles.comparePrice}>{formatTHB(compare)}</Text>
                </View>
                <View style={styles.trustRow}>
                  <Text style={styles.trust}>ส่งฟรี</Text>
                  <Text style={styles.trust}>COD</Text>
                  <Text style={styles.rating}>★ 4.8</Text>
                </View>
                <Text style={styles.sold}>ขายได้ {(12 + index * 7).toFixed(1)}K ชิ้น</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 4,
    paddingBottom: 24,
  },
  card: {
    marginHorizontal: H_PAD,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusItem: {
    width: '19%',
    alignItems: 'center',
    gap: 6,
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  spotlight: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F7F8F7',
    borderRadius: 12,
    padding: 10,
  },
  spotlightThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  spotlightTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
  },
  spotlightBody: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 15,
  },
  toolsRow: {
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    gap: 14,
  },
  toolItem: {
    width: 58,
    alignItems: 'center',
    gap: 5,
  },
  toolIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  toolLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent.live,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
    paddingHorizontal: H_PAD,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: H_PAD,
  },
  productCard: {
    width: COL_W,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
  },
  productVisual: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#E8EEEA',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  duration: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  durationText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  offBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.accent.live,
    borderBottomRightRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  offBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  adBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  adBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  productBody: {
    padding: 8,
    gap: 3,
  },
  productTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 16,
    minHeight: 32,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  salePrice: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.accent.live,
  },
  comparePrice: {
    fontSize: 10,
    color: colors.text.muted,
    textDecorationLine: 'line-through',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trust: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accent.live,
    backgroundColor: '#FFF0F3',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  rating: {
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.secondary,
  },
  sold: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: '600',
  },
});
