import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { ORDER_STATUS_LABEL, type MyOrder } from '@/modules/store/domain/types';
import type { OrdersListFilter } from './MyOrdersHub';
import { colors } from '@/shared/theme/colors';

const TABS: Array<{ key: OrdersListFilter; label: string }> = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'shipped', label: 'รอรับ' },
  { key: 'pending', label: 'รอชำระเงิน' },
  { key: 'paid', label: 'ที่ต้องจัดส่ง' },
  { key: 'review', label: 'รอรีวิว' },
  { key: 'returns', label: 'คืนสินค้า' },
];

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusHeadline(order: MyOrder) {
  if (order.shippingHeadline) return order.shippingHeadline;
  return ORDER_STATUS_LABEL[order.status];
}

function matchesFilter(order: MyOrder, filter: OrdersListFilter) {
  if (filter === 'all') return true;
  if (filter === 'pending') return order.status === 'pending';
  if (filter === 'paid') return order.status === 'paid';
  if (filter === 'shipped') return order.status === 'shipped';
  if (filter === 'review') return order.status === 'delivered' && !!order.needsReview;
  if (filter === 'returns') return order.status === 'cancelled';
  return true;
}

/** หน้าต่างที่ 2 — รายการคำสั่งซื้อเต็ม พร้อมแท็บสถานะ */
export function MyOrdersListScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ filter?: string }>();
  const initial = (typeof params.filter === 'string' ? params.filter : 'all') as OrdersListFilter;
  const [filter, setFilter] = useState<OrdersListFilter>(
    TABS.some((t) => t.key === initial) ? initial : 'all',
  );
  const [query, setQuery] = useState('');

  const myOrders = useOrdersStore((s) => s.myOrders);
  const cancelMyOrder = useOrdersStore((s) => s.cancelMyOrder);

  const orders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return myOrders.filter((o) => {
      if (!matchesFilter(o, filter)) return false;
      if (!q) return true;
      return (
        o.productTitle.toLowerCase().includes(q) ||
        o.shopName.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.trackingNo?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [myOrders, filter, query]);

  const renderOrder = ({ item }: { item: MyOrder }) => {
    const canCancel = item.status === 'pending' || item.status === 'paid';
    const canReview = item.status === 'delivered' && item.needsReview;

    return (
      <View style={styles.card}>
        <View style={styles.shopRow}>
          <Ionicons name="storefront-outline" size={14} color={colors.text.primary} />
          <Text style={styles.shopName} numberOfLines={1}>
            {item.shopName}
          </Text>
          {item.isMall ? (
            <View style={styles.mallBadge}>
              <Text style={styles.mallBadgeText}>Mall</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
          <Text style={styles.statusRight} numberOfLines={1}>
            {statusHeadline(item)}
          </Text>
        </View>

        <View style={styles.shipRow}>
          <Ionicons name="car-outline" size={15} color={colors.brand.primaryDark} />
          <Text style={styles.shipText} numberOfLines={2}>
            {item.shippingDetail ??
              (item.trackingNo ? `เลขพัสดุ ${item.trackingNo}` : item.placedAt)}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
        </View>

        <View style={styles.productRow}>
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: item.thumbnailColor }]} />
          )}
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.productTitle} numberOfLines={2}>
              {item.productTitle}
            </Text>
            <Text style={styles.variant}>{item.variantLabel}</Text>
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.unitPrice}>{formatTHB(item.amount / item.qty)}</Text>
            <Text style={styles.qty}>x{item.qty}</Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            ยอดรวม: <Text style={styles.totalValue}>{formatTHB(item.amount)}</Text>
          </Text>
        </View>

        {canReview ? (
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>รีวิว</Text>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                hitSlop={4}
                onPress={() => {
                  void Haptics.selectionAsync();
                  Alert.alert('ขอบคุณสำหรับรีวิว', `ให้ ${n} ดาวแก่ออเดอร์นี้แล้ว`);
                }}
              >
                <Ionicons name="star-outline" size={20} color={colors.accent.warning} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          {canCancel ? (
            <Pressable
              style={styles.outlineBtn}
              onPress={() =>
                Alert.alert('ยกเลิกคำสั่งซื้อ', 'ยืนยันยกเลิกออเดอร์นี้?', [
                  { text: 'ไม่ใช่', style: 'cancel' },
                  {
                    text: 'ยกเลิกออเดอร์',
                    style: 'destructive',
                    onPress: () => {
                      cancelMyOrder(item.id);
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    },
                  },
                ])
              }
            >
              <Text style={styles.outlineBtnText}>ยกเลิกคำสั่งซื้อ</Text>
            </Pressable>
          ) : null}
          {item.status === 'delivered' ? (
            <Pressable
              style={styles.outlineBtn}
              onPress={() => Alert.alert('ขอเงินคืน', 'ส่งคำขอคืนเงินแล้ว — รอร้านค้าตรวจสอบ')}
            >
              <Text style={styles.outlineBtnText}>ขอเงินคืน</Text>
            </Pressable>
          ) : null}
          {canReview ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => Alert.alert('เขียนรีวิว', 'เปิดฟอร์มรีวิวสินค้า')}
            >
              <Text style={styles.primaryBtnText}>เขียนรีวิว</Text>
            </Pressable>
          ) : null}
          {item.status === 'shipped' ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={() =>
                Alert.alert(
                  'ติดตามพัสดุ',
                  item.trackingNo
                    ? `เลขพัสดุ ${item.trackingNo}`
                    : 'กำลังรอขนส่งอัปเดตเลขพัสดุ',
                )
              }
            >
              <Text style={styles.primaryBtnText}>ติดตามพัสดุ</Text>
            </Pressable>
          ) : null}
          {item.status === 'pending' ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => Alert.alert('ชำระเงิน', 'เปิดหน้าชำระเงิน (เดโม)')}
            >
              <Text style={styles.primaryBtnText}>ชำระเงิน</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาคำสั่งซื้อของคุณ"
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
        </View>
        <Pressable hitSlop={8} onPress={() => Alert.alert('เมนู', 'ตัวกรองเพิ่มเติม / ความช่วยเหลือ')}>
          <Ionicons name="menu-outline" size={24} color={colors.text.primary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((t) => {
          const active = filter === t.key;
          return (
            <Pressable
              key={t.key}
              style={styles.tabItem}
              onPress={() => {
                void Haptics.selectionAsync();
                setFilter(t.key);
              }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              {active ? <View style={styles.tabUnderline} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.bonusBanner}>
        <Ionicons name="sparkles" size={14} color="#8A6210" />
        <Text style={styles.bonusText}>เขียนรีวิวรับโบนัสเพิ่ม — กดดาวใต้คำสั่งซื้อที่จัดส่งสำเร็จ</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        renderItem={renderOrder}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, gap: 10 }}
        ListEmptyComponent={
          <Text style={styles.empty}>ไม่พบคำสั่งซื้อในหมวดนี้</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F4' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  backBtn: { marginRight: 0 },
  searchBox: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border.soft,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    paddingVertical: 0,
  },
  tabsScroll: { flexGrow: 0 },
  tabs: {
    paddingHorizontal: 12,
    gap: 16,
    alignItems: 'flex-end',
    paddingBottom: 4,
  },
  tabItem: {
    paddingBottom: 8,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.muted,
  },
  tabTextActive: {
    color: colors.text.primary,
    fontWeight: '900',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    width: 22,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.text.primary,
  },
  bonusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 10,
    marginTop: 4,
    backgroundColor: '#FFF6E5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bonusText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#8A6210',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    gap: 10,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  shopName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
    maxWidth: '38%',
  },
  mallBadge: {
    backgroundColor: colors.brand.ink,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  mallBadgeText: {
    color: colors.accent.vault,
    fontSize: 9,
    fontWeight: '900',
  },
  statusRight: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: '800',
    color: colors.brand.primaryDark,
    maxWidth: '40%',
    textAlign: 'right',
  },
  shipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3FBF7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 16,
  },
  productRow: {
    flexDirection: 'row',
    gap: 10,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
    lineHeight: 17,
  },
  variant: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '600',
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  unitPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.primary,
  },
  qty: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '700',
  },
  totalRow: {
    alignItems: 'flex-end',
  },
  totalLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.secondary,
    marginRight: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  outlineBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.primary,
  },
  primaryBtn: {
    backgroundColor: colors.accent.live,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
  },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    marginTop: 40,
    fontSize: 13,
  },
});
