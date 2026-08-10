import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/shared/theme/colors';
import type { FeedProduct, ProductVariant } from '@/modules/feed/domain/types';

type Props = {
  product: FeedProduct | null;
  onCheckout?: (variant: ProductVariant, qty: number, total: number) => void;
};

type ShippingOption = {
  id: string;
  label: string;
  eta: string;
  fee: number;
};

const SHIPPING_OPTIONS: ShippingOption[] = [
  { id: 'standard', label: 'จัดส่งมาตรฐาน', eta: '3–5 วัน · ฟรีค่าส่ง', fee: 0 },
  { id: 'express', label: 'จัดส่งด่วน', eta: '1–2 วัน', fee: 59 },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_HEIGHT = 260;

function unitPriceFor(variant: ProductVariant, qty: number) {
  if (!variant.wholesaleTiers?.length) return variant.price;
  const sorted = [...variant.wholesaleTiers].sort((a, b) => b.minQty - a.minQty);
  const tier = sorted.find((t) => qty >= t.minQty);
  return tier?.unitPrice ?? variant.price;
}

function slideGradients(seed: string): Array<[string, string]> {
  const palettes: Array<[string, string]> = [
    ['#0B3D2E', '#00D68F'],
    ['#0A2A22', '#00A86B'],
    ['#101010', '#1F5F45'],
  ];
  const offset = seed.length % palettes.length;
  return [...palettes.slice(offset), ...palettes.slice(0, offset)];
}

export const ProductBottomSheet = forwardRef<BottomSheetModal, Props>(
  function ProductBottomSheet({ product, onCheckout }, ref) {
    const snapPoints = useMemo(() => ['82%'], []);
    const [variantId, setVariantId] = useState<string | null>(null);
    const [qty, setQty] = useState(1);
    const [shippingId, setShippingId] = useState<string>('standard');
    const [slideIndex, setSlideIndex] = useState(0);

    const activeVariant =
      product?.variants.find((v) => v.id === variantId) ?? product?.variants[0] ?? null;
    const shipping = SHIPPING_OPTIONS.find((s) => s.id === shippingId) ?? SHIPPING_OPTIONS[0];
    const slides = useMemo(() => slideGradients(product?.id ?? 'x'), [product?.id]);

    const moq = activeVariant?.moq ?? 1;
    const safeQty = Math.max(qty, moq);
    const unit = activeVariant ? unitPriceFor(activeVariant, safeQty) : 0;
    const total = unit * safeQty + shipping.fee;

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.55} />
      ),
      [],
    );

    const onScrollSlides = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setSlideIndex(idx);
    }, []);

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        onChange={(index) => {
          if (index >= 0 && product) {
            setVariantId(product.variants[0]?.id ?? null);
            setQty(product.variants[0]?.moq ?? 1);
            setShippingId('standard');
            setSlideIndex(0);
          }
        }}
      >
        {!product || !activeVariant ? (
          <Text style={styles.empty}>ไม่มีสินค้า</Text>
        ) : (
          <>
            <BottomSheetScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.carouselWrap}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onScrollSlides}
                  style={{ height: CAROUSEL_HEIGHT }}
                >
                  {slides.map((g, i) => (
                    <LinearGradient
                      key={i}
                      colors={g}
                      style={[styles.slide, { width: SCREEN_WIDTH }]}
                    >
                      <View style={styles.slideBadge}>
                        <Text style={styles.slideBadgeText}>{product.tier}</Text>
                      </View>
                    </LinearGradient>
                  ))}
                </ScrollView>
                <View style={styles.dots}>
                  {slides.map((_, i) => (
                    <View key={i} style={[styles.dot, i === slideIndex && styles.dotActive]} />
                  ))}
                </View>
              </View>

              <View style={styles.body}>
                <Text style={styles.tier}>{product.tier} · {product.shopName}</Text>
                <Text style={styles.title}>{product.name}</Text>

                <View style={styles.priceRow}>
                  <Text style={styles.priceNow}>฿{unit.toLocaleString('th-TH')}</Text>
                  {activeVariant.wholesaleTiers?.length ? (
                    <Text style={styles.priceHint}>ราคาส่งเมื่อซื้อจำนวนมาก</Text>
                  ) : null}
                </View>

                <Text style={styles.section}>เลือกสเปก</Text>
                <View style={styles.chips}>
                  {product.variants.map((v) => {
                    const selected = v.id === activeVariant.id;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => {
                          setVariantId(v.id);
                          setQty(v.moq ?? 1);
                          void Haptics.selectionAsync();
                        }}
                        style={[styles.chip, selected && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {v.label}
                        </Text>
                        {v.voltage ? (
                          <Text style={styles.chipMeta}>{v.voltage}{v.capacityAh ? ` · ${v.capacityAh}Ah` : ''}</Text>
                        ) : null}
                        {v.stock <= 3 ? (
                          <Text style={styles.stockWarn}>เหลือ {v.stock}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                {activeVariant.wholesaleTiers?.length ? (
                  <View style={styles.tierBox}>
                    <Text style={styles.section}>ราคาส่งขั้นบันได (MOQ {moq})</Text>
                    {activeVariant.wholesaleTiers.map((t) => (
                      <Text key={t.minQty} style={styles.tierRow}>
                        ≥ {t.minQty} ชิ้น → ฿{t.unitPrice.toLocaleString('th-TH')}/ชิ้น
                      </Text>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.section}>ตัวเลือกการจัดส่ง</Text>
                <View style={styles.shippingBox}>
                  {SHIPPING_OPTIONS.map((opt) => {
                    const selected = opt.id === shippingId;
                    return (
                      <Pressable
                        key={opt.id}
                        style={styles.shippingRow}
                        onPress={() => {
                          setShippingId(opt.id);
                          void Haptics.selectionAsync();
                        }}
                      >
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={selected ? colors.brand.primary : colors.text.muted}
                        />
                        <View style={styles.shippingBody}>
                          <Text style={styles.shippingLabel}>{opt.label}</Text>
                          <Text style={styles.shippingEta}>{opt.eta}</Text>
                        </View>
                        <Text style={styles.shippingFee}>
                          {opt.fee > 0 ? `+฿${opt.fee}` : 'ฟรี'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.qtyRow}>
                  <Text style={styles.section}>จำนวน</Text>
                  <View style={styles.qtyControls}>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => setQty((q) => Math.max(moq, q - 1))}
                    >
                      <Text style={styles.qtyBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.qtyValue}>{safeQty}</Text>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => setQty((q) => Math.min(activeVariant.stock, q + 1))}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </BottomSheetScrollView>

            <View style={styles.footer}>
              <View style={styles.footerTotal}>
                <Text style={styles.unitLabel}>ยอดรวม</Text>
                <Text style={styles.total}>฿{total.toLocaleString('th-TH')}</Text>
              </View>
              <View style={styles.footerBtns}>
                <Pressable
                  style={styles.cartBtn}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons name="cart-outline" size={18} color={colors.accent.warning} />
                  <Text style={styles.cartBtnText}>ใส่ตะกร้า</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    onCheckout?.(activeVariant, safeQty, total);
                  }}
                  style={styles.buyBtnWrap}
                >
                  <LinearGradient
                    colors={['#FF7A45', '#FE2C55']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buyBtn}
                  >
                    <Text style={styles.buyBtnText}>ซื้อเลย</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface.sheet,
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  content: {
    paddingBottom: 24,
  },
  empty: {
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 40,
  },
  carouselWrap: {},
  slide: {
    height: CAROUSEL_HEIGHT,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: 16,
  },
  slideBadge: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  slideBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 16,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  tier: {
    color: colors.brand.primary,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 4,
  },
  title: {
    color: colors.text.inverse,
    fontSize: 20,
    fontWeight: '900',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  priceNow: {
    color: colors.accent.live,
    fontSize: 26,
    fontWeight: '900',
  },
  priceHint: {
    color: colors.text.muted,
    fontSize: 12,
  },
  section: {
    color: colors.text.onDark,
    fontWeight: '700',
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border.onDark,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 96,
  },
  chipActive: {
    borderColor: colors.brand.primary,
    backgroundColor: 'rgba(0,214,143,0.12)',
  },
  chipText: {
    color: colors.text.onDark,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.brand.primary,
  },
  chipMeta: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  stockWarn: {
    color: colors.accent.warning,
    fontSize: 11,
    marginTop: 2,
  },
  tierBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  tierRow: {
    color: colors.text.muted,
    fontSize: 13,
    marginBottom: 4,
  },
  shippingBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  shippingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  shippingBody: { flex: 1 },
  shippingLabel: {
    color: colors.text.inverse,
    fontWeight: '700',
    fontSize: 14,
  },
  shippingEta: {
    color: colors.text.muted,
    fontSize: 12,
    marginTop: 2,
  },
  shippingFee: {
    color: colors.brand.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    color: colors.text.inverse,
    fontSize: 22,
    fontWeight: '700',
  },
  qtyValue: {
    color: colors.text.inverse,
    fontSize: 18,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: colors.surface.sheet,
  },
  footerTotal: {
    minWidth: 84,
  },
  unitLabel: {
    color: colors.text.muted,
    fontSize: 11,
  },
  total: {
    color: colors.text.inverse,
    fontSize: 19,
    fontWeight: '900',
  },
  footerBtns: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  cartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.accent.warning,
    borderRadius: 14,
    paddingVertical: 13,
  },
  cartBtnText: {
    color: colors.accent.warning,
    fontWeight: '800',
    fontSize: 13,
  },
  buyBtnWrap: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  buyBtn: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
});
