import React, { useEffect, useMemo } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  PAYMENT_OPTIONS,
  SHIPPING_OPTIONS,
  useCheckoutStore,
} from '@/modules/commerce/state/checkout-store';
import { colors } from '@/shared/theme/colors';
import {
  ENABLE_CHECKOUT_PLACE_ORDER,
  ENABLE_PAYLATER_AND_CREDIT_UI,
} from '@/shared/compliance/appStoreGates';
import { createCommerceOrder, payCommerceOrder } from '@/modules/commerce/data/commerceApi';
import { pullCommerceCatalog } from '@/modules/commerce/data/commerceSync';
import { incomingFromCommerceOrder } from '@/modules/store/domain/commerce-order-map';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { useBuyerPaymentStore } from '@/modules/account/state/buyer-payment-store';
import { buyerHint, type BuyerPaymentKind } from '@/modules/account/domain/buyer-payment';
import { promptText } from '@/shared/components/AppPrompt';
import { openLegalDocument } from '@/shared/legal/openLegal';

const ORANGE = '#EE4D2D';

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

export function CheckoutScreen() {
  const insets = useSafeAreaInsets();

  const lines = useCartStore((s) => s.lines);
  const removeLine = useCartStore((s) => s.removeLine);
  const selectedLines = useMemo(() => lines.filter((l) => l.selected !== false), [lines]);

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const variantMap = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const masterMap = useMemo(() => new Map(masters.map((m) => [m.id, m])), [masters]);

  const address = useCheckoutStore((s) => s.address);
  const paymentMethod = useCheckoutStore((s) => s.paymentMethod);
  const setPaymentMethod = useCheckoutStore((s) => s.setPaymentMethod);
  const cardLabel = useCheckoutStore((s) => s.cardLabel);
  const instruments = useBuyerPaymentStore((s) => s.instruments);
  const paymentHint = useMemo(() => {
    const kind: BuyerPaymentKind | undefined =
      paymentMethod === 'mobile_banking'
        ? 'bank_account'
        : paymentMethod === 'cod'
          ? undefined
          : (paymentMethod as BuyerPaymentKind);
    if (paymentMethod === 'cod') return 'จ่ายตอนรับของ';
    return buyerHint(instruments.find((a) => a.kind === kind));
  }, [instruments, paymentMethod]);
  const methodReady =
    paymentMethod === 'cod' ||
    instruments.some((a) =>
      paymentMethod === 'mobile_banking' ? a.kind === 'bank_account' : a.kind === paymentMethod,
    );
  const shippingMethod = useCheckoutStore((s) => s.shippingMethod);
  const setShippingMethod = useCheckoutStore((s) => s.setShippingMethod);
  const shopVoucherOn = useCheckoutStore((s) => s.shopVoucherOn);
  const setShopVoucher = useCheckoutStore((s) => s.setShopVoucher);
  const platformVoucherOn = useCheckoutStore((s) => s.platformVoucherOn);
  const setPlatformVoucher = useCheckoutStore((s) => s.setPlatformVoucher);
  const noteByShop = useCheckoutStore((s) => s.noteByShop);
  const setNote = useCheckoutStore((s) => s.setNote);
  const protectionOn = useCheckoutStore((s) => s.protectionOn);
  const setProtection = useCheckoutStore((s) => s.setProtection);

  const shopGroups = useMemo(() => {
    const map = new Map<string, typeof selectedLines>();
    for (const line of selectedLines) {
      const variant = variantMap.get(line.variantId);
      const master = variant ? masterMap.get(variant.masterSkuId) : undefined;
      const shopName = master?.shopName ?? 'ร้านค้า BoomMall';
      const list = map.get(shopName) ?? [];
      list.push(line);
      map.set(shopName, list);
    }
    return [...map.entries()];
  }, [selectedLines, variantMap, masterMap]);

  const merchandise = selectedLines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  const itemCount = selectedLines.reduce((n, l) => n + l.qty, 0);
  const totals = computeOrderTotals({
    merchandise,
    shopCount: shopGroups.length,
    shopVoucherOn,
    platformVoucherOn,
    shippingMethod,
    protectionOn,
    itemCount,
  });

  const paymentLabel =
    PAYMENT_OPTIONS.find((p) => p.id === paymentMethod)?.label ?? 'ช่องทางชำระเงิน';

  useEffect(() => {
    if (!methodReady) setPaymentMethod('cod');
  }, [methodReady, setPaymentMethod]);

  const placeOrder = async () => {
    if (!ENABLE_CHECKOUT_PLACE_ORDER) {
      Alert.alert(
        'ชำระเงินยังไม่พร้อม',
        'ระบบชำระเงินผ่าน Payment Gateway ยังไม่ได้เชื่อมต่อ — ไม่สามารถสั่งซื้อหรือยืนยันการชำระในเวอร์ชันนี้ได้',
      );
      return;
    }
    if (!selectedLines.length) {
      Alert.alert('ไม่มีสินค้า', 'กลับไปเลือกสินค้าในตะกร้า');
      return;
    }
    if (!methodReady) {
      Alert.alert('ยังเลือกช่องทางชำระไม่ได้', 'สมัครช่องทางชำระเงินก่อน หรือใช้เก็บเงินปลายทาง');
      return;
    }
    try {
      const created = await createCommerceOrder({
        lines: selectedLines.map((line) => {
          const variant = variantMap.get(line.variantId);
          const master = variant ? masterMap.get(variant.masterSkuId) : undefined;
          return {
            variantId: line.variantId,
            warehouseId: line.warehouseId,
            qty: line.qty,
            unitPrice: line.unitPrice,
            productId: variant?.masterSkuId,
            title: master?.title,
            sku: variant?.sku,
            label: variant?.label,
            color: variant?.attrs.color,
            variant: variant?.label,
            image: master?.imageUri,
          };
        }),
        shippingFeeThb: totals.shippingPayable,
        shipping: {
          name: address.name,
          phone: address.phone,
          line1: address.line1,
          district: address.district,
          amphoe: address.amphoe,
          province: address.province,
          postcode: address.postcode,
          paymentMethod,
        },
        paymentMethod,
      });
      const paid = await payCommerceOrder(created.data.id);
      useOrdersStore.getState().upsertIncoming([incomingFromCommerceOrder(paid.data)]);
      for (const line of selectedLines) removeLine(line.variantId, line.warehouseId);
      await pullCommerceCatalog();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'สั่งซื้อสำเร็จ',
        `กันสต็อกในคลังแล้ว · ร้านจะตัดยอดตอนแพ็กเสร็จ\nยอดชำระ ${formatTHB(paid.data.merchandiseThb)}\nชำระผ่าน ${paymentLabel}${
          paymentMethod === 'card' ? ` (${cardLabel})` : ''
        }`,
        [
          {
            text: 'ดูคำสั่งซื้อ',
            onPress: () => {
              if (router.canDismiss()) router.dismissAll();
              router.replace('/orders');
            },
          },
          {
            text: 'ปิด',
            onPress: () => {
              if (router.canDismiss()) router.dismissAll();
              else router.back();
            },
          },
        ],
      );
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'ชำระไม่สำเร็จ',
        e instanceof Error ? e.message : 'Payment Gateway ยังไม่พร้อม',
      );
    }
  };

  if (!selectedLines.length) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, alignItems: 'center' }]}>
        <Text style={styles.headerTitle}>ทำการสั่งซื้อ</Text>
        <Text style={{ marginTop: 40, color: colors.text.muted }}>ไม่มีสินค้าที่เลือกไว้</Text>
        <Pressable style={{ marginTop: 16 }} onPress={() => router.back()}>
          <Text style={{ color: ORANGE, fontWeight: '800' }}>กลับไปตะกร้า</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>ทำการสั่งซื้อ</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Address */}
        <Pressable
          style={styles.card}
          onPress={() => {
            void promptText({
              title: 'แก้ไขชื่อผู้รับ',
              defaultValue: address.name,
            }).then((text) => {
              if (text?.trim()) useCheckoutStore.getState().setAddress({ name: text.trim() });
            });
          }}
        >
          <View style={styles.addressRow}>
            <Ionicons name="location" size={18} color={ORANGE} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.addressName}>
                {address.name}  {address.phone}
              </Text>
              <Text style={styles.addressBody}>
                {address.line1} {address.district}, {address.amphoe}, {address.province},{' '}
                {address.postcode}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
          </View>
        </Pressable>

        {/* Shop groups */}
        {shopGroups.map(([shopName, shopLines]) => {
          const shopMerch = shopLines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
          const shippingShare =
            shopGroups.length > 0 ? Math.round(totals.shippingPayable / shopGroups.length) : 0;
          return (
            <View key={shopName} style={styles.card}>
              <View style={styles.shopHead}>
                <View style={styles.recBadge}>
                  <Text style={styles.recBadgeText}>ร้านแนะนำ</Text>
                </View>
                <Text style={styles.shopName} numberOfLines={1}>
                  {shopName}
                </Text>
              </View>

              {shopLines.map((line) => {
                const variant = variantMap.get(line.variantId);
                const master = variant ? masterMap.get(variant.masterSkuId) : undefined;
                const compare = Math.round(line.unitPrice * 1.15);
                return (
                  <View key={`${line.variantId}-${line.warehouseId}`} style={styles.productRow}>
                    <Image
                      source={{
                        uri:
                          variant?.imageUri ??
                          master?.imageUri ??
                          masterContentImage(master?.id ?? line.variantId),
                      }}
                      style={styles.thumb}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.productTitle} numberOfLines={2}>
                        {master?.title ?? 'สินค้า'}
                      </Text>
                      <Text style={styles.variant}>{variant?.label ?? 'มาตรฐาน'}</Text>
                      {ENABLE_PAYLATER_AND_CREDIT_UI ? (
                        <Text style={styles.spayHint}>0% BoomMall PayLater (สูงสุด 5 เดือน)</Text>
                      ) : null}
                      <View style={styles.priceRow}>
                        <Text style={styles.price}>{formatTHB(line.unitPrice)}</Text>
                        <Text style={styles.compare}>{formatTHB(compare)}</Text>
                        <Text style={styles.qty}>x{line.qty}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              <Pressable
                style={styles.protectRow}
                onPress={() => setProtection(!protectionOn)}
              >
                <Ionicons
                  name={protectionOn ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={protectionOn ? ORANGE : colors.text.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.protectTitle}>ความคุ้มครองสินค้า · ฿22 x{itemCount}</Text>
                  <Text style={styles.protectBody}>
                    คุ้มครองอุบัติเหตุ/สูญหายหลังยืนยันรับสินค้า · เรียนรู้เพิ่มเติม
                  </Text>
                </View>
              </Pressable>

              <Pressable style={styles.metaRow} onPress={() => setShopVoucher(!shopVoucherOn)}>
                <Text style={styles.metaLabel}>โค้ดส่วนลดร้านค้า</Text>
                <Text style={[styles.metaValue, shopVoucherOn && { color: ORANGE }]}>
                  {shopVoucherOn ? `-${formatTHB(Math.round(totals.shopDiscount / shopGroups.length) || 0)}` : 'กดใช้โค้ด'}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
              </Pressable>

              <View style={styles.noteRow}>
                <Text style={styles.metaLabel}>หมายเหตุ</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="ฝากข้อความถึงผู้ขายหรือบริษัทขนส่ง"
                  placeholderTextColor={colors.text.muted}
                  value={noteByShop[shopName] ?? ''}
                  onChangeText={(t) => setNote(shopName, t)}
                />
              </View>

              <View style={styles.shipSection}>
                <View style={styles.shipHead}>
                  <Text style={styles.sectionTitle}>ตัวเลือกการจัดส่ง</Text>
                  <Text style={styles.seeAll}>ดูทั้งหมด</Text>
                </View>
                {SHIPPING_OPTIONS.map((opt) => {
                  const active = shippingMethod === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.shipOption, active && styles.shipOptionActive]}
                      onPress={() => setShippingMethod(opt.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.shipEta}>{opt.eta}</Text>
                        <Text style={styles.shipLabel}>{opt.label}</Text>
                        <Text style={styles.shipLate}>
                          รับโค้ดส่วนลดสูงสุด ฿30 หากได้รับสินค้าล่าช้า
                        </Text>
                      </View>
                      <Text style={styles.shipFee}>
                        {opt.free || (platformVoucherOn && opt.id === 'standard')
                          ? 'ส่งฟรี'
                          : formatTHB(opt.fee)}
                      </Text>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.shopTotalRow}>
                <Text style={styles.shopTotalLabel}>
                  สินค้ารวม {shopLines.reduce((n, l) => n + l.qty, 0)} ชิ้น
                </Text>
                <Text style={styles.shopTotalValue}>
                  {formatTHB(shopMerch + shippingShare)}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Platform vouchers + payment */}
        <View style={styles.card}>
          <Pressable
            style={styles.metaRow}
            onPress={() => setPlatformVoucher(!platformVoucherOn)}
          >
            <Text style={styles.metaLabel}>โค้ดส่วนลด BoomMall</Text>
            {platformVoucherOn ? (
              <>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>-{formatTHB(totals.platformDiscount)}</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: '#E8F7F0' }]}>
                  <Text style={[styles.tagText, { color: colors.brand.primaryDark }]}>
                    โค้ดส่งฟรี
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.metaValue}>เลือกโค้ด</Text>
            )}
            <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
          </Pressable>

          <View style={styles.vipBanner}>
            <Text style={styles.vipText}>VIP · สมัครรับส่วนลดเพิ่มและส่งฟรีทั่วไทย</Text>
          </View>

        </View>

        <View style={styles.card}>
          <View style={styles.shipHead}>
            <Text style={styles.sectionTitle}>ช่องทางการชำระเงิน</Text>
            <Pressable onPress={() => router.push('/shop/payment')}>
              <Text style={styles.seeAll}>ดูทั้งหมด</Text>
            </Pressable>
          </View>
          <Pressable style={styles.paymentRow} onPress={() => router.push('/shop/payment')}>
            <Ionicons
              name={
                paymentMethod === 'card'
                  ? 'card-outline'
                  : paymentMethod === 'cod'
                    ? 'cash-outline'
                    : paymentMethod === 'promptpay'
                      ? 'qr-code-outline'
                      : paymentMethod === 'truemoney' || paymentMethod === 'mobile_banking'
                        ? 'phone-portrait-outline'
                        : paymentMethod === 'bank_account'
                          ? 'business-outline'
                          : 'wallet-outline'
              }
              size={20}
              color={ORANGE}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentLabel}>{paymentLabel}</Text>
              {paymentHint ? <Text style={styles.paymentSub}>{paymentHint}</Text> : null}
            </View>
            <Ionicons name="checkmark-circle" size={20} color={ORANGE} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ข้อมูลการชำระเงิน</Text>
          <SummaryRow label="รวมการสั่งซื้อ" value={formatTHB(merchandise)} />
          <SummaryRow label="การจัดส่ง" value={formatTHB(totals.shippingBase)} />
          <SummaryRow
            label="ส่วนลดค่าจัดส่ง"
            value={`-${formatTHB(totals.shippingDiscount)}`}
            danger
          />
          <SummaryRow
            label="ส่วนลด"
            value={`-${formatTHB(totals.shopDiscount + totals.platformDiscount)}`}
            danger
          />
          {totals.protection > 0 ? (
            <SummaryRow label="ความคุ้มครองสินค้า" value={formatTHB(totals.protection)} />
          ) : null}
          <SummaryRow label="ยอดชำระเงินทั้งหมด" value={formatTHB(totals.total)} bold />
        </View>

        <Text style={styles.terms}>
          {ENABLE_CHECKOUT_PLACE_ORDER
            ? 'การกด "สั่งสินค้า" ถือว่าคุณยอมรับเงื่อนไขบริการและนโยบายคืนเงิน/คืนสินค้าของ BoomMall'
            : 'ยังไม่สามารถสั่งซื้อได้จนกว่า Payment Gateway จะพร้อม — ไม่มีการเรียกเก็บเงินในเวอร์ชันนี้'}
        </Text>
        <View style={styles.legalLinks}>
          <Pressable onPress={() => void openLegalDocument('terms')}>
            <Text style={styles.legalLink}>ข้อกำหนดการใช้บริการ</Text>
          </Pressable>
          <Text style={styles.legalSep}>·</Text>
          <Pressable onPress={() => void openLegalDocument('privacy')}>
            <Text style={styles.legalLink}>นโยบายความเป็นส่วนตัว</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <View>
          <Text style={styles.footerTotal}>รวมยอดสั่งซื้อ {formatTHB(totals.total)}</Text>
          {totals.saved > 0 ? (
            <Text style={styles.footerSaved}>ประหยัดไป {formatTHB(totals.saved)}</Text>
          ) : null}
        </View>
        <Pressable
          style={[styles.orderBtn, !ENABLE_CHECKOUT_PLACE_ORDER && { opacity: 0.45 }]}
          onPress={placeOrder}
        >
          <Text style={styles.orderBtnText}>
            {ENABLE_CHECKOUT_PLACE_ORDER ? 'สั่งสินค้า' : 'ยังไม่พร้อมชำระ'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  danger,
  bold,
}: {
  label: string;
  value: string;
  danger?: boolean;
  bold?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontWeight: '900', color: colors.text.primary }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          danger && { color: ORANGE },
          bold && { fontWeight: '900', fontSize: 16, color: colors.text.primary },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  card: {
    marginHorizontal: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  addressName: { fontSize: 13, fontWeight: '900', color: colors.text.primary },
  addressBody: { fontSize: 12, color: colors.text.secondary, fontWeight: '600', lineHeight: 17 },
  shopHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recBadge: {
    backgroundColor: ORANGE,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  recBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  shopName: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.text.primary },
  productRow: { flexDirection: 'row', gap: 10 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#E8EEEA' },
  productTitle: { fontSize: 13, fontWeight: '800', color: colors.text.primary, lineHeight: 17 },
  variant: { fontSize: 11, color: colors.text.muted, fontWeight: '600' },
  spayHint: { fontSize: 10, color: ORANGE, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '900', color: ORANGE },
  compare: { fontSize: 11, color: colors.text.muted, textDecorationLine: 'line-through' },
  qty: { marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  protectRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  protectTitle: { fontSize: 12, fontWeight: '800', color: colors.text.primary },
  protectBody: { fontSize: 10, color: colors.text.muted, marginTop: 2, lineHeight: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  metaValue: { marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: colors.text.muted },
  noteRow: { gap: 6 },
  noteInput: {
    backgroundColor: '#F3F5F4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 12,
    color: colors.text.primary,
  },
  shipSection: { gap: 8 },
  shipHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: colors.text.primary },
  seeAll: { fontSize: 12, fontWeight: '700', color: colors.text.muted },
  shipOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: 10,
    padding: 10,
  },
  shipOptionActive: {
    borderColor: '#22C55E',
    backgroundColor: '#F3FBF7',
  },
  shipEta: { fontSize: 12, fontWeight: '900', color: colors.text.primary },
  shipLabel: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, marginTop: 2 },
  shipLate: { fontSize: 10, color: colors.text.muted, marginTop: 3 },
  shipFee: { fontSize: 12, fontWeight: '900', color: ORANGE },
  shopTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
    paddingTop: 10,
  },
  shopTotalLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  shopTotalValue: { fontSize: 14, fontWeight: '900', color: colors.text.primary },
  tag: {
    backgroundColor: '#FFECE8',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { color: ORANGE, fontSize: 10, fontWeight: '900' },
  vipBanner: {
    backgroundColor: '#FFF6E5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  vipText: { fontSize: 12, fontWeight: '800', color: '#8A6210' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentLabel: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  paymentSub: { fontSize: 11, color: colors.text.muted, fontWeight: '700', marginTop: 1 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  summaryValue: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  terms: {
    marginHorizontal: 16,
    marginBottom: 8,
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.primaryDark,
  },
  legalSep: {
    fontSize: 12,
    color: colors.text.muted,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
    paddingHorizontal: 14,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerTotal: { fontSize: 15, fontWeight: '900', color: colors.text.primary },
  footerSaved: { fontSize: 12, fontWeight: '800', color: ORANGE, marginTop: 2 },
  orderBtn: {
    backgroundColor: ORANGE,
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  orderBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
