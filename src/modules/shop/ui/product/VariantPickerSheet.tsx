import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import type { CustomFieldDef, MasterSku, SkuVariant } from '@/modules/commerce/domain/types';
import { displayMediaUri } from '@/modules/commerce/data/product-media';
import { ZoomGalleryModal } from '@/modules/shop/ui/product/ZoomGalleryModal';
import {
  formatTHB,
  selectedSpecSummary,
  selectedSpecTitle,
  specRowsFor,
  variantImageUri,
  variantListLabel,
  type GallerySlide,
} from '@/modules/shop/domain/product-display';
import { SHIPPING_OPTIONS, useCheckoutStore } from '@/modules/commerce/state/checkout-store';
import { colors } from '@/shared/theme/colors';

const ORANGE = '#EE4D2D';
const BUY = '#F53D2D';
const CART = '#FF5000';
const SCREEN_H = Dimensions.get('window').height;

export type PickerMode = 'cart' | 'buy';
export type VariantPick = { variant: SkuVariant; qty: number };

type Props = {
  visible: boolean;
  mode: PickerMode;
  onClose: () => void;
  master: MasterSku;
  variants: SkuVariant[];
  variant: SkuVariant;
  onSelectVariant: (variant: SkuVariant) => void;
  variantStock: (id: string) => number;
  cartQtyOf?: (id: string) => number;
  fieldDefs?: CustomFieldDef[];
  onConfirm: (picks: VariantPick[]) => void;
};

function Stepper({
  qty,
  min,
  max,
  onChange,
}: {
  qty: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        style={[styles.qtyBtn, qty <= min && styles.qtyBtnOff]}
        onPress={() => onChange(qty - 1)}
        disabled={qty <= min}
        hitSlop={4}
        accessibilityLabel="ลดจำนวน"
      >
        <Text style={styles.qtyBtnText}>−</Text>
      </Pressable>
      <TextInput
        value={String(qty)}
        onChangeText={(text) => {
          const parsed = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
          if (!Number.isFinite(parsed)) return;
          onChange(Math.min(max, Math.max(min, parsed)));
        }}
        keyboardType="number-pad"
        selectTextOnFocus
        style={styles.qtyInput}
        accessibilityLabel="จำนวน"
      />
      <Pressable
        style={[styles.qtyBtn, qty >= max && styles.qtyBtnOff]}
        onPress={() => onChange(qty + 1)}
        disabled={qty >= max}
        hitSlop={4}
        accessibilityLabel="เพิ่มจำนวน"
      >
        <Text style={styles.qtyBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function VariantPickerSheet({
  visible,
  mode,
  onClose,
  master,
  variants,
  variant,
  onSelectVariant,
  variantStock,
  cartQtyOf,
  fieldDefs = [],
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const address = useCheckoutStore((s) => s.address);
  const shippingMethod = useCheckoutStore((s) => s.shippingMethod);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [focusId, setFocusId] = useState(variant.id);
  const [qtyById, setQtyById] = useState<Record<string, number>>({});

  const slides = useMemo(
    () => (variants.length ? variants : [variant]),
    [variants, variant],
  );

  useEffect(() => {
    if (!visible) return;
    setFocusId(variant.id);
    setQtyById({});
    // Reset only when the sheet opens — don't wipe qty when focus changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- variant captured at open
  }, [visible]);

  const focused = slides.find((item) => item.id === focusId) ?? variant;
  const focusedStock = variantStock(focused.id);
  const focusedCartQty = cartQtyOf?.(focused.id) ?? 0;

  const picks = useMemo(
    () =>
      slides
        .filter((item) => (qtyById[item.id] ?? 0) > 0)
        .map((item) => ({ variant: item, qty: qtyById[item.id] })),
    [slides, qtyById],
  );

  const total = picks.reduce((sum, pick) => sum + pick.variant.price * pick.qty, 0);
  const pickCount = picks.reduce((sum, pick) => sum + pick.qty, 0);
  const shipping = SHIPPING_OPTIONS.find((opt) => opt.id === shippingMethod) ?? SHIPPING_OPTIONS[0];

  const zoomSlides = useMemo<GallerySlide[]>(
    () =>
      slides.map((item) => ({
        key: `pick-${item.id}`,
        uri: variantImageUri(master, item),
        type: 'image',
        variantId: item.id,
      })),
    [slides, master],
  );
  const zoomIndex = Math.max(
    0,
    slides.findIndex((item) => item.id === focused.id),
  );

  const focusedSpecs = useMemo(
    () => specRowsFor(master, focused, fieldDefs).filter((row) => row.key !== 'brand'),
    [master, focused, fieldDefs],
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const focus = useCallback(
    (item: SkuVariant) => {
      setFocusId(item.id);
      onSelectVariant(item);
    },
    [onSelectVariant],
  );

  const setQty = useCallback(
    (item: SkuVariant, next: number) => {
      const stock = variantStock(item.id);
      const remaining = Math.max(0, stock - (cartQtyOf?.(item.id) ?? 0));
      const moq = item.moq ?? 1;
      const clamped = Math.min(remaining, Math.max(0, next));
      const qty = clamped > 0 ? Math.min(remaining, Math.max(moq, clamped)) : 0;
      setQtyById((prev) => ({ ...prev, [item.id]: qty }));
      if (qty > 0) focus(item);
      void Haptics.selectionAsync();
    },
    [cartQtyOf, focus, variantStock],
  );

  const confirmLabel = mode === 'cart' ? 'เพิ่มลงตะกร้า' : 'ตกลง / สรุปสั่งซื้อ';
  const confirmColor = mode === 'cart' ? CART : BUY;
  const canConfirm = picks.length > 0 && picks.every((pick) => variantStock(pick.variant.id) > 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <DragDownDismiss
        onDismiss={onClose}
        showDim
        rootInModal
        scrollY={scrollY}
        style={styles.root}
      >
        <View style={[styles.sheet, { height: SCREEN_H * 0.92, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.handle} />

          <View style={styles.topRow}>
            <Text style={styles.selected} numberOfLines={2}>
              {picks.length > 1
                ? selectedSpecSummary(picks.map((pick) => pick.variant))
                : selectedSpecTitle(focused)}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="ปิด" style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.text.secondary} />
            </Pressable>
          </View>

          <View style={styles.shipRow}>
            <Ionicons name="location-outline" size={14} color={colors.text.secondary} />
            <Text style={styles.shipText} numberOfLines={1}>
              ส่งภายใน 48 ชม. · {shipping.eta} · {address.amphoe.replace(/^อำเภอ/, '')}
            </Text>
          </View>

          <View style={styles.summary}>
            <Pressable onPress={() => setZoomOpen(true)} accessibilityLabel="ดูรูปขยาย">
              <Image
                source={{ uri: displayMediaUri(variantImageUri(master, focused)) }}
                style={styles.thumb}
              />
            </Pressable>
            <View style={styles.summaryCopy}>
              <Text style={styles.price}>{formatTHB(picks.length ? total : focused.price)}</Text>
              <Text style={styles.stockHint}>
                {picks.length
                  ? `เลือก ${pickCount} ชิ้น`
                  : focusedStock <= 0
                    ? 'หมดสต็อก'
                    : `มีสินค้า ${focusedStock.toLocaleString('th-TH')} ชิ้น`}
                {focusedCartQty > 0 ? ` · ในตะกร้า ${focusedCartQty}` : ''}
              </Text>
            </View>
          </View>

          <Animated.ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            bounces
            style={styles.list}
            contentContainerStyle={styles.listContent}
          >
            <Text style={styles.sectionTitle}>ตัวเลือกย่อย ({slides.length})</Text>
            {mode === 'cart' ? (
              <Text style={styles.sectionHint}>เลือกตัวเลือกอื่นเพิ่มลงตะกร้าได้ · จำนวนเริ่มที่ 0</Text>
            ) : null}
            {slides.map((item) => {
              const qty = qtyById[item.id] ?? 0;
              const on = qty > 0;
              const stock = variantStock(item.id);
              const inCart = cartQtyOf?.(item.id) ?? 0;
              const remaining = Math.max(0, stock - inCart);
              return (
                <View
                  key={item.id}
                  style={[styles.row, on && styles.rowOn, remaining <= 0 && styles.rowOut]}
                >
                  <Pressable
                    onPress={() => focus(item)}
                    style={styles.rowMain}
                    accessibilityLabel={variantListLabel(item)}
                  >
                    <Image
                      source={{ uri: displayMediaUri(variantImageUri(master, item)) }}
                      style={styles.rowThumb}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, on && styles.rowTitleOn]} numberOfLines={2}>
                        {variantListLabel(item)}
                      </Text>
                      <Text style={[styles.rowPrice, on && styles.rowTitleOn]}>{formatTHB(item.price)}</Text>
                    </View>
                  </Pressable>
                  {remaining <= 0 ? (
                    <Text style={styles.rowOutText}>{stock <= 0 ? 'หมด' : 'ในตะกร้าครบ'}</Text>
                  ) : (
                    <View style={styles.rowQty}>
                      <Stepper
                        qty={qty}
                        min={0}
                        max={remaining}
                        onChange={(next) => setQty(item, next)}
                      />
                      <Text style={styles.limitHint}>จำกัด {stock.toLocaleString('th-TH')} ชิ้น</Text>
                    </View>
                  )}
                </View>
              );
            })}

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>สเปก</Text>
            {focusedSpecs.length ? (
              focusedSpecs.map((row, i) => (
                <View key={row.key} style={[styles.specRow, i === 0 && { borderTopWidth: 0 }]}>
                  <Text style={styles.specLabel}>{row.label}</Text>
                  <Text style={styles.specValue}>{row.value}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.specEmpty}>ตัวเลือกนี้ยังไม่มีสเปกเพิ่มเติม</Text>
            )}
          </Animated.ScrollView>

          <Pressable
            style={[styles.confirm, { backgroundColor: confirmColor }, !canConfirm && styles.confirmOff]}
            onPress={() => onConfirm(picks)}
            disabled={!canConfirm}
          >
            <Text style={styles.confirmText}>
              {confirmLabel}
              {pickCount ? ` · ${pickCount} ชิ้น · ${formatTHB(total)}` : ''}
            </Text>
          </Pressable>
        </View>
      </DragDownDismiss>
      <ZoomGalleryModal
        visible={zoomOpen}
        slides={zoomSlides}
        index={zoomIndex}
        onIndexChange={(next) => {
          const item = slides[next];
          if (item) focus(item);
        }}
        onClose={() => setZoomOpen(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E6E5',
    marginBottom: 8,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  selected: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text.primary, lineHeight: 18 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    marginBottom: 12,
  },
  shipText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#EEE',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.soft,
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  price: { fontSize: 22, fontWeight: '900', color: ORANGE },
  stockHint: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  list: { flex: 1 },
  listContent: { paddingBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#EDEDED',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  rowOn: { borderColor: ORANGE, backgroundColor: '#FFF8F5' },
  rowOut: { opacity: 0.45 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#EEE' },
  rowTitle: { fontSize: 13, fontWeight: '700', color: colors.text.primary, lineHeight: 18 },
  rowTitleOn: { color: ORANGE },
  rowPrice: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.text.secondary },
  rowOutText: { fontSize: 12, fontWeight: '800', color: colors.accent.live },
  rowQty: { alignItems: 'flex-end', gap: 4 },
  limitHint: { fontSize: 11, fontWeight: '600', color: colors.text.muted },
  specRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  specLabel: { width: 108, fontSize: 13, color: colors.text.secondary, fontWeight: '600' },
  specValue: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text.primary },
  specEmpty: { fontSize: 13, color: colors.text.muted, marginBottom: 8 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8F8',
  },
  qtyBtnOff: { opacity: 0.35 },
  qtyBtnText: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: -1 },
  qtyInput: {
    minWidth: 36,
    height: 32,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border.soft,
    paddingVertical: 0,
  },
  confirm: {
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  confirmOff: { opacity: 0.4 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
