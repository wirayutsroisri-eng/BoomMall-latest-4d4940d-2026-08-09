import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useCartStore } from '@/modules/commerce/state/cart-store';
import {
  computeOrderTotals,
  useCheckoutStore,
} from '@/modules/commerce/state/checkout-store';
import { colors } from '@/shared/theme/colors';
import { variantListLabel } from '@/modules/shop/domain/product-display';

const ORANGE = '#EE4D2D';

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

function Checkbox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.checkbox}>
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? ORANGE : colors.text.muted}
      />
    </Pressable>
  );
}

export function CartScreen() {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);

  const lines = useCartStore((s) => s.lines);
  const setQty = useCartStore((s) => s.setQty);
  const removeLine = useCartStore((s) => s.removeLine);
  const toggleLine = useCartStore((s) => s.toggleLine);
  const toggleShop = useCartStore((s) => s.toggleShop);
  const toggleAll = useCartStore((s) => s.toggleAll);
  const selectedCount = useCartStore((s) => s.selectedCount());
  const selectedSubtotal = useCartStore((s) => s.selectedSubtotal());
  const lineCount = useCartStore((s) => s.lineCount());

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const totalAvailable = useInventoryStore((s) => s.totalAvailable);

  const platformVoucherOn = useCheckoutStore((s) => s.platformVoucherOn);
  const setPlatformVoucher = useCheckoutStore((s) => s.setPlatformVoucher);
  const shopVoucherOn = useCheckoutStore((s) => s.shopVoucherOn);
  const shippingMethod = useCheckoutStore((s) => s.shippingMethod);

  const variantMap = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const masterMap = useMemo(() => new Map(masters.map((m) => [m.id, m])), [masters]);

  const shopGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        shopName: string;
        lines: typeof lines;
        variantIds: string[];
      }
    >();
    for (const line of lines) {
      const variant = variantMap.get(line.variantId);
      const master = variant ? masterMap.get(variant.masterSkuId) : undefined;
      const shopName = master?.shopName ?? 'ร้านค้า BoomMall';
      const row = map.get(shopName) ?? { shopName, lines: [], variantIds: [] };
      row.lines.push(line);
      row.variantIds.push(line.variantId);
      map.set(shopName, row);
    }
    return [...map.values()];
  }, [lines, variantMap, masterMap]);

  const allSelected = lines.length > 0 && lines.every((l) => l.selected !== false);

  const totals = computeOrderTotals({
    merchandise: selectedSubtotal,
    shopCount: new Set(
      lines
        .filter((l) => l.selected !== false)
        .map((l) => {
          const v = variantMap.get(l.variantId);
          return v ? masterMap.get(v.masterSkuId)?.shopName ?? 'x' : 'x';
        }),
    ).size,
    shopVoucherOn,
    platformVoucherOn,
    shippingMethod,
    protectionOn: false,
    itemCount: selectedCount,
  });

  const goCheckout = () => {
    if (!selectedCount) {
      Alert.alert('ยังไม่ได้เลือกสินค้า', 'ติ๊กเลือกสินค้าอย่างน้อย 1 รายการ');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/shop/checkout');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.title}>รถเข็น ({lineCount})</Text>
        <View style={styles.topRight}>
          <Pressable onPress={() => setEditing((v) => !v)} hitSlop={8}>
            <Text style={styles.editText}>{editing ? 'เสร็จ' : 'แก้ไข'}</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push('/(tabs)/chat')}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.text.primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 160 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {!lines.length ? (
          <View style={styles.empty}>
            <Ionicons name="cart-outline" size={48} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>ตะกร้าว่าง</Text>
            <Text style={styles.emptyBody}>ไปเลือกสินค้าจากหน้าร้านค้า แล้วกลับมาชำระเงินที่นี่</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.replace('/(tabs)/shop')}>
              <Text style={styles.emptyBtnText}>ไปหน้าร้านค้า</Text>
            </Pressable>
          </View>
        ) : (
          shopGroups.map((group) => {
            const shopSelected = group.lines.every((l) => l.selected !== false);
            return (
              <View key={group.shopName} style={styles.shopCard}>
                <View style={styles.shopHeader}>
                  <Checkbox
                    checked={shopSelected}
                    onPress={() => toggleShop(group.variantIds, !shopSelected)}
                  />
                  <View style={styles.mallBadge}>
                    <Text style={styles.mallBadgeText}>Mall</Text>
                  </View>
                  <Text style={styles.shopName} numberOfLines={1}>
                    {group.shopName}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
                  <Pressable style={{ marginLeft: 'auto' }} onPress={() => setEditing(true)}>
                    <Text style={styles.editText}>แก้ไข</Text>
                  </Pressable>
                </View>

                <View style={styles.freeShipBanner}>
                  <Text style={styles.freeShipText}>คุณได้รับ โค้ดส่งฟรี!</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: '78%' }]} />
                  </View>
                </View>

                {group.lines.map((line) => {
                  const variant = variantMap.get(line.variantId);
                  const master = variant ? masterMap.get(variant.masterSkuId) : undefined;
                  const avail = totalAvailable(line.variantId);
                  const selected = line.selected !== false;
                  const compare = Math.round(line.unitPrice * 1.25);
                  return (
                    <View key={`${line.variantId}-${line.warehouseId}`} style={styles.lineRow}>
                      <Checkbox
                        checked={selected}
                        onPress={() => toggleLine(line.variantId, line.warehouseId)}
                      />
                      <View style={styles.thumbWrap}>
                        <Image
                          source={{
                            uri:
                              variant?.imageUri ??
                              master?.imageUri ??
                              masterContentImage(master?.id ?? line.variantId),
                          }}
                          style={styles.thumb}
                        />
                        {avail <= 5 ? (
                          <View style={styles.stockOverlay}>
                            <Text style={styles.stockOverlayText}>เหลือ {avail} ชิ้น</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.productTitle} numberOfLines={2}>
                          {master?.title ?? variant?.sku ?? 'สินค้า'}
                        </Text>
                        <Pressable
                          style={styles.variantChip}
                          onPress={() => {
                            if (!master) return;
                            void Haptics.selectionAsync();
                            router.push({
                              pathname: '/shop/product/[id]',
                              params: {
                                id: master.id,
                                pick: '1',
                                variantId: line.variantId,
                              },
                            });
                          }}
                          accessibilityLabel="เลือกตัวเลือกสินค้าเพิ่ม"
                        >
                          <Text style={styles.variantChipText} numberOfLines={1}>
                            {variant ? variantListLabel(variant) : 'มาตรฐาน'}
                          </Text>
                          <Ionicons name="chevron-down" size={12} color={colors.text.muted} />
                        </Pressable>
                        <View style={styles.promoRow}>
                          <Text style={styles.promoTag}>ส่งฟรี</Text>
                          <Text style={styles.promoTag}>โค้ดร้าน</Text>
                        </View>
                        <View style={styles.priceQtyRow}>
                          <View>
                            <Text style={styles.price}>{formatTHB(line.unitPrice)}</Text>
                            <Text style={styles.compare}>{formatTHB(compare)}</Text>
                          </View>
                          {editing ? (
                            <Pressable
                              onPress={() => {
                                Alert.alert('ลบสินค้านี้?', 'สินค้าจะถูกนำออกจากตะกร้า', [
                                  { text: 'ยกเลิก', style: 'cancel' },
                                  {
                                    text: 'ลบ',
                                    style: 'destructive',
                                    onPress: () => removeLine(line.variantId, line.warehouseId),
                                  },
                                ]);
                              }}
                              style={styles.deleteBtn}
                              accessibilityLabel="ลบสินค้า"
                            >
                              <Text style={styles.deleteBtnText}>ลบ</Text>
                            </Pressable>
                          ) : (
                            <View style={styles.qtyBox}>
                              <Pressable
                                style={styles.qtyBtn}
                                onPress={() => {
                                  const res = setQty(line.variantId, line.warehouseId, line.qty - 1);
                                  if (!res.ok) Alert.alert('อัปเดตไม่ได้', res.message);
                                }}
                              >
                                <Ionicons name="remove" size={14} color={colors.text.primary} />
                              </Pressable>
                              <Text style={styles.qtyText}>{line.qty}</Text>
                              <Pressable
                                style={styles.qtyBtn}
                                onPress={() => {
                                  const res = setQty(line.variantId, line.warehouseId, line.qty + 1);
                                  if (!res.ok) Alert.alert('อัปเดตไม่ได้', res.message);
                                }}
                              >
                                <Ionicons name="add" size={14} color={colors.text.primary} />
                              </Pressable>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}

                <Pressable
                  style={styles.voucherRow}
                  onPress={() =>
                    Alert.alert('โค้ดร้านค้า', shopVoucherOn ? 'ใช้โค้ดร้านอยู่แล้ว' : 'ยังไม่มีโค้ด')
                  }
                >
                  <Ionicons name="ticket-outline" size={16} color={ORANGE} />
                  <Text style={styles.voucherLabel}>เพิ่มโค้ดร้านค้า</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
                </Pressable>
              </View>
            );
          })
        )}

        {lines.length ? (
          <View style={styles.manageRow}>
            <Text style={styles.manageText}>จัดการสินค้าที่คุณอาจไม่ต้องการ</Text>
            <Pressable onPress={() => setEditing(true)}>
              <Text style={styles.editText}>แก้ไข</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {lines.length ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable
            style={styles.footerVoucher}
            onPress={() => setPlatformVoucher(!platformVoucherOn)}
          >
            <Ionicons name="ticket" size={16} color={ORANGE} />
            <Text style={styles.footerVoucherLabel}>โค้ดส่วนลดของ BoomMall</Text>
            {platformVoucherOn ? (
              <>
                <View style={styles.voucherBadge}>
                  <Text style={styles.voucherBadgeText}>-{formatTHB(totals.platformDiscount)}</Text>
                </View>
                <View style={[styles.voucherBadge, { backgroundColor: '#E8F7F0' }]}>
                  <Text style={[styles.voucherBadgeText, { color: colors.brand.primaryDark }]}>
                    ส่งฟรี
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.footerVoucherHint}>เลือกโค้ด</Text>
            )}
            <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
          </Pressable>

          <View style={styles.coinsRow}>
            <Text style={styles.coinsText}>BoomMall Coins ไม่เพียงพอ</Text>
            <Switch value={false} disabled trackColor={{ false: '#D0D5D2' }} />
          </View>

          <View style={styles.checkoutBar}>
            <Checkbox checked={allSelected} onPress={() => toggleAll(!allSelected)} />
            <Text style={styles.allLabel}>ทั้งหมด</Text>
            <View style={{ flex: 1 }} />
            <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
              <View style={styles.shipHint}>
                <Ionicons name="car-outline" size={12} color={colors.text.muted} />
                <Text style={styles.shipHintText}>
                  {totals.shippingPayable === 0 ? 'ส่งฟรี' : formatTHB(totals.shippingPayable)}
                </Text>
              </View>
              <Text style={styles.footerTotal}>{formatTHB(totals.total)}</Text>
              {totals.saved > 0 ? (
                <Text style={styles.footerSaved}>ส่วนลด {formatTHB(totals.saved)}</Text>
              ) : null}
            </View>
            <Pressable style={styles.payBtn} onPress={goCheckout}>
              <Text style={styles.payBtnText}>ชำระเงิน ({selectedCount})</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F4' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    color: colors.text.primary,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  editText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.text.primary, marginTop: 8 },
  emptyBody: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: ORANGE,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  shopCard: {
    marginHorizontal: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  shopHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkbox: { width: 26, alignItems: 'center' },
  mallBadge: {
    backgroundColor: ORANGE,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  mallBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  shopName: { fontSize: 13, fontWeight: '800', color: colors.text.primary, maxWidth: '46%' },
  freeShipBanner: {
    backgroundColor: '#E8F7F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  freeShipText: { fontSize: 11, fontWeight: '800', color: colors.brand.primaryDark },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CDEADB',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.brand.primary },
  lineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  thumbWrap: { width: 78, height: 78, borderRadius: 8, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%', backgroundColor: '#E8EEEA' },
  stockOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  stockOverlayText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  productTitle: { fontSize: 13, fontWeight: '800', color: colors.text.primary, lineHeight: 17 },
  variantChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F5F4',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  variantChipText: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, maxWidth: 160 },
  promoRow: { flexDirection: 'row', gap: 4 },
  promoTag: {
    fontSize: 9,
    fontWeight: '800',
    color: ORANGE,
    borderWidth: 1,
    borderColor: 'rgba(238,77,45,0.35)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  priceQtyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  price: { fontSize: 15, fontWeight: '900', color: ORANGE },
  compare: {
    fontSize: 11,
    color: colors.text.muted,
    textDecorationLine: 'line-through',
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: 6,
    overflow: 'hidden',
  },
  qtyBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  qtyText: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 12,
    color: colors.text.primary,
  },
  deleteBtn: {
    backgroundColor: ORANGE,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  voucherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
    paddingTop: 10,
  },
  voucherLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  manageRow: {
    marginHorizontal: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageText: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
  },
  footerVoucher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  footerVoucherLabel: { fontSize: 12, fontWeight: '700', color: colors.text.primary },
  footerVoucherHint: {
    marginLeft: 'auto',
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '700',
  },
  voucherBadge: {
    backgroundColor: '#FFECE8',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  voucherBadgeText: { color: ORANGE, fontSize: 10, fontWeight: '900' },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  coinsText: { fontSize: 12, fontWeight: '700', color: colors.text.muted },
  checkoutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 4,
  },
  allLabel: { fontSize: 12, fontWeight: '700', color: colors.text.primary },
  shipHint: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  shipHintText: { fontSize: 10, color: colors.text.muted, fontWeight: '700' },
  footerTotal: { fontSize: 18, fontWeight: '900', color: ORANGE },
  footerSaved: { fontSize: 10, fontWeight: '800', color: ORANGE },
  payBtn: {
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  payBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
