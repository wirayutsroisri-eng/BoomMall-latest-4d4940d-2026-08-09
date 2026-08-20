import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
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
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors } from '@/shared/theme/colors';
import type { FeedProduct } from '@/modules/feed/domain/types';
import type { SkuVariant, WarehouseId } from '@/modules/commerce/domain/types';
import { displayMediaUri } from '@/modules/commerce/data/product-media';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useCartStore } from '@/modules/commerce/state/cart-store';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import {
  SHIPPING_OPTIONS,
  useCheckoutStore,
} from '@/modules/commerce/state/checkout-store';
import { ProductVideoThumb } from '@/modules/store/ui/sell/ProductVideoThumb';
import {
  buildGallery,
  formatTHB,
  resolveShopMaster,
  shopKeyOf,
  variantListLabel,
  chatProductCardOf,
} from '@/modules/shop/domain/product-display';

type Props = {
  product: FeedProduct | null;
};

function dismissSheet(ref: React.ForwardedRef<BottomSheetModal>) {
  if (ref && typeof ref !== 'function') ref.current?.dismiss();
}

function unitPriceFor(variant: SkuVariant, qty: number) {
  if (!variant.wholesaleTiers?.length) return variant.price;
  const sorted = [...variant.wholesaleTiers].sort((a, b) => b.minQty - a.minQty);
  const tier = sorted.find((t) => qty >= t.minQty);
  return tier?.unitPrice ?? variant.price;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_HEIGHT = 260;

export const ProductBottomSheet = forwardRef<BottomSheetModal, Props>(
  function ProductBottomSheet({ product }, ref) {
    const snapPoints = useMemo(() => ['82%'], []);
    const masters = useInventoryStore((s) => s.masters);
    const allVariants = useInventoryStore((s) => s.variants);
    const available = useInventoryStore((s) => s.available);
    const totalAvailable = useInventoryStore((s) => s.totalAvailable);
    const listStockRows = useInventoryStore((s) => s.listStockRows);
    const addToCart = useCartStore((s) => s.addToCart);
    const startShopConversation = useChatStore((s) => s.startShopConversation);
    const sendProductCard = useChatStore((s) => s.sendProductCard);
    const toggleAll = useCartStore((s) => s.toggleAll);
    const toggleLine = useCartStore((s) => s.toggleLine);
    const cartQtyOf = useCartStore((s) => s.qtyOf);
    const shippingMethod = useCheckoutStore((s) => s.shippingMethod);
    const setShippingMethod = useCheckoutStore((s) => s.setShippingMethod);

    const master = useMemo(() => resolveShopMaster(product, masters), [product, masters]);
    const variants = useMemo(
      () =>
        master
          ? allVariants.filter((v) => v.masterSkuId === master.id && v.status !== 'hidden')
          : [],
      [allVariants, master],
    );
    const gallery = useMemo(
      () => (master ? buildGallery(master, variants) : []),
      [master, variants],
    );

    const [variantId, setVariantId] = useState<string | null>(null);
    const [qty, setQty] = useState(1);
    const [slideIndex, setSlideIndex] = useState(0);

    const activeVariant =
      variants.find((v) => v.id === variantId) ?? variants[0] ?? null;
    const shipping =
      SHIPPING_OPTIONS.find((s) => s.id === shippingMethod) ?? SHIPPING_OPTIONS[0];
    const stock = activeVariant ? totalAvailable(activeVariant.id) : 0;
    const inCart = activeVariant ? cartQtyOf(activeVariant.id) : 0;
    const remaining = Math.max(0, stock - inCart);
    const moq = activeVariant?.moq ?? 1;
    const safeQty = Math.min(remaining, Math.max(qty, remaining > 0 ? moq : 0));
    const unit = activeVariant ? unitPriceFor(activeVariant, Math.max(safeQty, 1)) : 0;
    const shipFee = shipping.free ? 0 : shipping.fee;
    const total = unit * Math.max(safeQty, 0) + (safeQty > 0 ? shipFee : 0);

    const warehouseFor = useCallback(
      (variant: SkuVariant): WarehouseId => {
        const rows = listStockRows(variant.id);
        const ready = rows.find((r) => available(variant.id, r.warehouseId) > 0) ?? rows[0];
        return (ready?.warehouseId ?? 'WH-CTI-MAIN') as WarehouseId;
      },
      [available, listStockRows],
    );

    const resetForProduct = useCallback(() => {
      const first = variants[0];
      setVariantId(first?.id ?? null);
      setQty(first?.moq ?? 1);
      setSlideIndex(0);
    }, [variants]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.55} />
      ),
      [],
    );

    const onScrollSlides = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setSlideIndex(idx);
      const slide = gallery[idx];
      if (!slide?.variantId) return;
      const match = variants.find((v) => v.id === slide.variantId);
      if (match) {
        setVariantId(match.id);
        setQty(match.moq ?? 1);
      }
    }, [gallery, variants]);

    const pickVariant = (next: SkuVariant) => {
      setVariantId(next.id);
      setQty(next.moq ?? 1);
      const idx = gallery.findIndex((s) => s.variantId === next.id);
      if (idx >= 0) setSlideIndex(idx);
      void Haptics.selectionAsync();
    };

    const addCurrent = () => {
      if (!activeVariant) return { ok: false as const, message: 'ยังไม่มีตัวเลือก' };
      if (safeQty < 1) return { ok: false as const, message: 'สต็อกไม่พอ หรืออยู่ในตะกร้าครบแล้ว' };
      return addToCart({
        variantId: activeVariant.id,
        warehouseId: warehouseFor(activeVariant),
        qty: safeQty,
        unitPrice: unit,
      });
    };

    const onAddCart = () => {
      const res = addCurrent();
      if (!res.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('ใส่ตะกร้าไม่สำเร็จ', res.message);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const onBuyNow = () => {
      const res = addCurrent();
      if (!res.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('ยังสั่งไม่ได้', res.message);
        return;
      }
      if (!activeVariant) return;
      toggleAll(false);
      toggleLine(activeVariant.id, warehouseFor(activeVariant));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dismissSheet(ref);
      router.push('/shop/checkout');
    };

    const onChat = () => {
      if (!master || !activeVariant) return;
      const shopId = master.ownerShopId?.trim() || shopKeyOf(master);
      const conversationId = startShopConversation({
        shopId,
        shopName: master.shopName,
        sellerId: shopId,
      });
      sendProductCard(conversationId, chatProductCardOf(master, activeVariant));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      dismissSheet(ref);
      jumpToChatThread(conversationId);
    };

    const openPdp = () => {
      if (!master) {
        router.push('/(tabs)/shop');
        return;
      }
      dismissSheet(ref);
      router.push({ pathname: '/shop/product/[id]', params: { id: master.id, pick: '1' } });
    };

    const openShop = () => {
      if (!master) {
        router.push('/(tabs)/shop');
        return;
      }
      dismissSheet(ref);
      router.push({ pathname: '/shop/store/[shopKey]', params: { shopKey: shopKeyOf(master) } });
    };

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        onChange={(index) => {
          if (index >= 0) resetForProduct();
        }}
      >
        {!master || !activeVariant ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>สินค้านี้ยังไม่ได้ลงขายในร้านค้า</Text>
            <Text style={styles.emptyHint}>ลงสินค้าจากหน้าร้านก่อน จึงจะซื้อจากคลิปได้</Text>
            <Pressable style={styles.emptyBtn} onPress={openShop}>
              <Text style={styles.emptyBtnText}>ไปหน้าร้าน</Text>
            </Pressable>
          </View>
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
                  {gallery.map((slide) => (
                    <View key={slide.key} style={[styles.slide, { width: SCREEN_WIDTH }]}>
                      {slide.type === 'video' ? (
                        <ProductVideoThumb
                          uri={displayMediaUri(slide.uri)}
                          style={styles.slideMedia}
                          contentFit="cover"
                          interactive={false}
                        />
                      ) : (
                        <Image
                          source={{ uri: displayMediaUri(slide.uri) }}
                          style={styles.slideMedia}
                          resizeMode="cover"
                        />
                      )}
                      <View style={styles.slideBadge}>
                        <Text style={styles.slideBadgeText}>{master.channel}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                {gallery.length > 1 ? (
                  <View style={styles.dots}>
                    {gallery.map((slide, i) => (
                      <View key={slide.key} style={[styles.dot, i === slideIndex && styles.dotActive]} />
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.body}>
                <Pressable onPress={openShop} hitSlop={6}>
                  <Text style={styles.tier}>
                    {master.channel} · {master.shopName}
                  </Text>
                </Pressable>
                <Pressable onPress={openPdp}>
                  <Text style={styles.title}>{master.title}</Text>
                </Pressable>

                <View style={styles.priceRow}>
                  <Text style={styles.priceNow}>{formatTHB(unit)}</Text>
                  {activeVariant.wholesaleTiers?.length ? (
                    <Text style={styles.priceHint}>ราคาส่งเมื่อซื้อจำนวนมาก</Text>
                  ) : null}
                </View>

                <View style={styles.sectionHead}>
                  <Text style={styles.section}>เลือกสเปก</Text>
                  <Pressable onPress={openPdp} hitSlop={8} accessibilityLabel="ดูตัวเลือกทั้งหมดในร้าน">
                    <Text style={styles.moreLink}>ดูทั้งหมด</Text>
                  </Pressable>
                </View>
                <View style={styles.chips}>
                  {variants.map((v) => {
                    const selected = v.id === activeVariant.id;
                    const left = Math.max(0, totalAvailable(v.id) - cartQtyOf(v.id));
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => pickVariant(v)}
                        style={[styles.chip, selected && styles.chipActive, left <= 0 && styles.chipOut]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]} numberOfLines={2}>
                          {variantListLabel(v)}
                        </Text>
                        {v.attrs.voltage ? (
                          <Text style={styles.chipMeta}>
                            {v.attrs.voltage}
                            {v.attrs.capacityAh ? ` · ${v.attrs.capacityAh}Ah` : ''}
                          </Text>
                        ) : null}
                        {left <= 3 ? (
                          <Text style={styles.stockWarn}>{left <= 0 ? 'หมด' : `เหลือ ${left}`}</Text>
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
                        ≥ {t.minQty} ชิ้น → {formatTHB(t.unitPrice)}/ชิ้น
                      </Text>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.section}>ตัวเลือกการจัดส่ง</Text>
                <View style={styles.shippingBox}>
                  {SHIPPING_OPTIONS.map((opt) => {
                    const selected = opt.id === shippingMethod;
                    const fee = opt.free ? 0 : opt.fee;
                    return (
                      <Pressable
                        key={opt.id}
                        style={styles.shippingRow}
                        onPress={() => {
                          setShippingMethod(opt.id);
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
                        <Text style={styles.shippingFee}>{fee > 0 ? `+${formatTHB(fee)}` : 'ฟรี'}</Text>
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
                      onPress={() => setQty((q) => Math.min(remaining, q + 1))}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                {inCart > 0 ? (
                  <Text style={styles.cartHint}>อยู่ในตะกร้า {inCart} ชิ้น · เหลือใส่ได้อีก {remaining}</Text>
                ) : (
                  <Text style={styles.cartHint}>มีสินค้า {stock.toLocaleString('th-TH')} ชิ้น</Text>
                )}
              </View>
            </BottomSheetScrollView>

            <View style={styles.footer}>
              <View style={styles.footerTotal}>
                <Text style={styles.unitLabel}>ยอดรวม</Text>
                <Text style={styles.total}>{formatTHB(total)}</Text>
              </View>
              <View style={styles.footerBtns}>
                <Pressable style={styles.chatBtn} onPress={onChat} accessibilityLabel="แชทร้าน">
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.text.inverse} />
                  <Text style={styles.chatBtnText}>แชท</Text>
                </Pressable>
                <Pressable style={styles.cartBtn} onPress={onAddCart}>
                  <Ionicons name="cart-outline" size={18} color={colors.accent.warning} />
                  <Text style={styles.cartBtnText}>ใส่ตะกร้า</Text>
                </Pressable>
                <Pressable onPress={onBuyNow} style={styles.buyBtnWrap}>
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
  emptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 48,
    alignItems: 'center',
    gap: 8,
  },
  empty: {
    color: colors.text.inverse,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyHint: {
    color: colors.text.muted,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: colors.brand.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyBtnText: {
    color: '#04140E',
    fontWeight: '800',
  },
  carouselWrap: {},
  slide: {
    height: CAROUSEL_HEIGHT,
    backgroundColor: '#111',
  },
  slideMedia: {
    ...StyleSheet.absoluteFill,
  },
  slideBadge: {
    position: 'absolute',
    left: 16,
    bottom: 16,
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
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  section: {
    color: colors.text.onDark,
    fontWeight: '700',
    marginBottom: 8,
  },
  moreLink: {
    color: colors.brand.primary,
    fontSize: 12,
    fontWeight: '800',
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
    maxWidth: '100%',
  },
  chipActive: {
    borderColor: colors.brand.primary,
    backgroundColor: 'rgba(0,214,143,0.12)',
  },
  chipOut: { opacity: 0.45 },
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
    marginBottom: 4,
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
  cartHint: {
    color: colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
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
    gap: 8,
  },
  chatBtn: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 14,
    paddingVertical: 10,
  },
  chatBtnText: {
    color: colors.text.inverse,
    fontWeight: '800',
    fontSize: 10,
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
