import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { displayMediaUri } from '@/modules/commerce/data/product-media';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useCartStore } from '@/modules/commerce/state/cart-store';
import type { MasterSku, SkuVariant, WarehouseId } from '@/modules/commerce/domain/types';
import { thumbnailUriOf } from '@/modules/commerce/domain/product-media';
import { ProductVideoThumb } from '@/modules/store/ui/sell/ProductVideoThumb';

import { useChatStore } from '@/modules/chat/state/chat-store';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { ReportBlockSheet } from '@/modules/safety/ui/ReportBlockSheet';
import { ZoomGalleryModal } from '@/modules/shop/ui/product/ZoomGalleryModal';
import { DimensionOverlay } from '@/modules/shop/ui/product/DimensionOverlay';
import {
  VariantPickerSheet,
  type PickerMode,
  type VariantPick,
} from '@/modules/shop/ui/product/VariantPickerSheet';
import {
  computeOrderTotals,
  useCheckoutStore,
} from '@/modules/commerce/state/checkout-store';
import { trackCommerceEvent } from '@/modules/commerce/data/commerceSync';
import {
  buildGallery,
  conditionBadge,
  formatTHB,
  overlayForSlide,
  priceRangeLabel,
  promoShareProduct,
  promoShareShop,
  ratingOf,
  relatedRank,
  selectedSpecTitle,
  shopAvatarUri,
  shopHandleOf,
  shopKeyOf,
  slideIndexForVariant,
  specRowsFor,
  variantImageUri,
  chatProductCardOf,
} from '@/modules/shop/domain/product-display';
import { colors } from '@/shared/theme/colors';

const SCREEN_W = Dimensions.get('window').width;
const HERO_H = Math.round((SCREEN_W * 5) / 4);
const H_PAD = 14;
const REC_GAP = 8;
const REC_W = (SCREEN_W - H_PAD * 2 - REC_GAP * 2) / 3;
const ORANGE = '#EE4D2D';
const BUY = '#F53D2D';
const RELATED_PAGE = 9;

function OverlayBtn({
  icon,
  onPress,
  compact,
  badge,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  compact: boolean;
  badge?: number;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      style={[styles.overlayBtn, compact && styles.overlayBtnCompact]}
    >
      <Ionicons name={icon} size={18} color={compact ? colors.text.primary : '#fff'} />
      {badge && badge > 0 ? (
        <View style={styles.overlayBadge}>
          <Text style={styles.overlayBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function RecThumb({
  master,
  price,
  width,
  onPress,
}: {
  master: MasterSku;
  price: number;
  width: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.recCard, { width }]} onPress={onPress}>
      <Image
        source={{ uri: master.imageUri ?? masterContentImage(master.id) }}
        style={[styles.recThumb, { width, height: width }]}
        resizeMode="cover"
      />
      <Text style={styles.recTitleText} numberOfLines={2}>
        {master.title}
      </Text>
      <Text style={styles.recPrice}>{formatTHB(price)}</Text>
    </Pressable>
  );
}

export function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, pick, variantId: focusVariantParam } = useLocalSearchParams<{
    id: string;
    pick?: string;
    variantId?: string;
  }>();
  const productId = typeof id === 'string' ? id : '';
  const openPickOnLoad = pick === '1' || pick === 'cart' || pick === 'buy';
  const focusVariantId = typeof focusVariantParam === 'string' ? focusVariantParam : '';

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const fieldDefs = useInventoryStore((s) => s.customFieldDefs);
  const available = useInventoryStore((s) => s.available);
  const totalAvailable = useInventoryStore((s) => s.totalAvailable);
  const listStockRows = useInventoryStore((s) => s.listStockRows);

  const addToCart = useCartStore((s) => s.addToCart);
  const toggleAll = useCartStore((s) => s.toggleAll);
  const toggleLine = useCartStore((s) => s.toggleLine);
  const cartLines = useCartStore((s) => s.lines);
  const lineCount = cartLines.reduce((n, l) => n + l.qty, 0);
  const cartQtyOf = useCallback(
    (variantId: string) =>
      cartLines.filter((l) => l.variantId === variantId).reduce((n, l) => n + l.qty, 0),
    [cartLines],
  );

  const startShopConversation = useChatStore((s) => s.startShopConversation);
  const sendProductCard = useChatStore((s) => s.sendProductCard);
  const isFollowing = useFollowStore((s) => s.isFollowing);
  const follow = useFollowStore((s) => s.follow);
  const unfollow = useFollowStore((s) => s.unfollow);

  const shippingMethod = useCheckoutStore((s) => s.shippingMethod);
  const shopVoucherOn = useCheckoutStore((s) => s.shopVoucherOn);
  const platformVoucherOn = useCheckoutStore((s) => s.platformVoucherOn);

  const master = useMemo(
    () => masters.find((m) => m.id === productId) ?? null,
    [masters, productId],
  );
  const itemVariants = useMemo(
    () => variants.filter((v) => v.masterSkuId === productId && v.status !== 'hidden'),
    [variants, productId],
  );

  const [variantId, setVariantId] = useState<string | null>(null);
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [heroIndex, setHeroIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(true);
  const [descOpen, setDescOpen] = useState(true);
  const [usageOpen, setUsageOpen] = useState(true);
  const [relatedCount, setRelatedCount] = useState(RELATED_PAGE);
  const [reportOpen, setReportOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('cart');
  const [toast, setToast] = useState<string | null>(null);

  const heroRef = useRef<FlatList>(null);
  const autoOpenedPickFor = useRef<string | null>(null);

  const pickedVariant = itemVariants.find((v) => v.id === variantId) ?? null;
  const activeVariant = pickedVariant ?? itemVariants[0] ?? null;
  const qty = activeVariant ? (qtyById[activeVariant.id] ?? activeVariant.moq ?? 1) : 1;

  const gallery = useMemo(
    () => (master ? buildGallery(master, itemVariants) : []),
    [master, itemVariants],
  );

  useEffect(() => {
    setVariantId(null);
    setQtyById({});
    setHeroIndex(0);
    setRelatedCount(RELATED_PAGE);
    setCompact(false);
    setPickerOpen(false);
    setToast(null);
    autoOpenedPickFor.current = null;
  }, [productId]);

  useEffect(() => {
    if (!master) return;
    trackCommerceEvent('product_view', 'product', master.id);
  }, [master?.id]);

  const syncHeroToVariant = useCallback(
    (variant: SkuVariant) => {
      const next = slideIndexForVariant(gallery, variant);
      setHeroIndex(next);
      requestAnimationFrame(() => {
        heroRef.current?.scrollToIndex({ index: next, animated: true });
      });
    },
    [gallery],
  );

  const onSelectVariant = useCallback(
    (variant: SkuVariant) => {
      setVariantId(variant.id);
      setQtyById((prev) =>
        prev[variant.id] != null ? prev : { ...prev, [variant.id]: variant.moq ?? 1 },
      );
      syncHeroToVariant(variant);
      void Haptics.selectionAsync();
    },
    [syncHeroToVariant],
  );

  const shopKey = master ? shopKeyOf(master) : '';
  const shopProducts = useMemo(() => {
    if (!master) return [];
    return masters.filter((m) => m.id !== master.id && shopKeyOf(m) === shopKey);
  }, [masters, master, shopKey]);

  const recommended = useMemo(() => shopProducts.slice(0, 6), [shopProducts]);

  const relatedAll = useMemo(() => {
    if (!master) return [];
    return masters
      .filter((m) => m.id !== master.id && shopKeyOf(m) !== shopKey)
      .sort((a, b) => relatedRank(master.id, a.id) - relatedRank(master.id, b.id));
  }, [masters, master, shopKey]);

  const related = relatedAll.slice(0, relatedCount);

  const minPrice = itemVariants.length
    ? Math.min(...itemVariants.map((v) => v.price))
    : master?.basePrice ?? 0;
  const maxPrice = itemVariants.length
    ? Math.max(...itemVariants.map((v) => v.price))
    : master?.basePrice ?? 0;
  const rangeLabel = master ? priceRangeLabel(master, itemVariants) : '';
  const displayPrice =
    pickedVariant && itemVariants.length > 1 ? formatTHB(pickedVariant.price) : rangeLabel;
  const showRangeHint = Boolean(pickedVariant && itemVariants.length > 1 && minPrice !== maxPrice);

  const stock = activeVariant ? totalAvailable(activeVariant.id) : 0;
  const moq = activeVariant?.moq ?? 1;
  const outOfStock = !activeVariant || stock <= 0;
  const allOut =
    !itemVariants.length || itemVariants.every((v) => totalAvailable(v.id) <= 0);
  const quoteQty = Math.max(moq, qty);
  const quoteMerchandise = (pickedVariant ?? activeVariant)?.price
    ? (pickedVariant ?? activeVariant)!.price * quoteQty
    : 0;
  const quote = computeOrderTotals({
    merchandise: quoteMerchandise,
    shopCount: 1,
    shopVoucherOn,
    platformVoucherOn,
    shippingMethod,
    protectionOn: false,
    itemCount: quoteQty,
  });

  const specs = useMemo(
    () => (master ? specRowsFor(master, activeVariant, fieldDefs) : []),
    [master, activeVariant, fieldDefs],
  );

  const warehouseFor = useCallback(
    (variant: SkuVariant): WarehouseId => {
      const rows = listStockRows(variant.id);
      const ready = rows.find((r) => available(variant.id, r.warehouseId) > 0) ?? rows[0];
      return (ready?.warehouseId ?? 'WH-CTI-MAIN') as WarehouseId;
    },
    [listStockRows, available],
  );

  const priceOf = useCallback(
    (m: MasterSku) => {
      const vs = variants.filter((v) => v.masterSkuId === m.id);
      return vs.length ? Math.min(...vs.map((v) => v.price)) : m.basePrice;
    },
    [variants],
  );

  const openProduct = useCallback((nextId: string) => {
    router.push({ pathname: '/shop/product/[id]', params: { id: nextId } });
  }, []);

  const onHeroScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      setHeroIndex(next);
      const slide = gallery[next];
      if (!slide?.variantId) return;
      const match = itemVariants.find((v) => v.id === slide.variantId);
      if (!match || match.id === variantId) return;
      setVariantId(match.id);
      setQtyById((prev) =>
        prev[match.id] != null ? prev : { ...prev, [match.id]: match.moq ?? 1 },
      );
    },
    [gallery, itemVariants, variantId],
  );

  const onPageScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setCompact(e.nativeEvent.contentOffset.y > 140);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const openPicker = useCallback(
    (mode: PickerMode) => {
      if (!itemVariants.length) {
        Alert.alert('ยังไม่มีตัวเลือก', 'สินค้านี้ยังไม่มี SKU ให้สั่ง');
        return;
      }
      if (!variantId && itemVariants[0]) onSelectVariant(itemVariants[0]);
      setPickerMode(mode);
      setPickerOpen(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [itemVariants, variantId, onSelectVariant],
  );

  useEffect(() => {
    if (!openPickOnLoad || !itemVariants.length) return;
    const token = `${productId}:${focusVariantId}:${pick ?? 'cart'}`;
    if (autoOpenedPickFor.current === token) return;
    autoOpenedPickFor.current = token;
    const focus =
      itemVariants.find((item) => item.id === focusVariantId) ?? itemVariants[0];
    if (focus) {
      setVariantId(focus.id);
      setQtyById((prev) =>
        prev[focus.id] != null ? prev : { ...prev, [focus.id]: focus.moq ?? 1 },
      );
    }
    setPickerMode(pick === 'buy' ? 'buy' : 'cart');
    const timer = setTimeout(() => setPickerOpen(true), 80);
    return () => clearTimeout(timer);
  }, [openPickOnLoad, productId, focusVariantId, itemVariants, pick]);

  const onAddCart = useCallback(() => openPicker('cart'), [openPicker]);

  const onBuyNow = useCallback(() => openPicker('buy'), [openPicker]);

  const confirmPicker = useCallback(
    (picks: VariantPick[]) => {
      if (!picks.length) {
        Alert.alert('ยังไม่ได้เลือก', 'เลือกตัวเลือกอย่างน้อย 1 รายการ');
        return;
      }
      const added: VariantPick[] = [];
      for (const pick of picks) {
        const left = totalAvailable(pick.variant.id) - cartQtyOf(pick.variant.id);
        if (pick.qty > left) {
          Alert.alert(
            'สต็อกไม่พอ',
            left <= 0
              ? `${pick.variant.label} อยู่ในตะกร้าครบแล้ว`
              : `${pick.variant.label} เหลือใส่ได้อีก ${left} ชิ้น`,
          );
          return;
        }
        const res = addToCart({
          variantId: pick.variant.id,
          warehouseId: warehouseFor(pick.variant),
          qty: pick.qty,
          unitPrice: pick.variant.price,
        });
        if (!res.ok) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert('ใส่ตะกร้าไม่สำเร็จ', res.message);
          return;
        }
        added.push(pick);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQtyById((prev) => {
        const next = { ...prev };
        for (const pick of added) next[pick.variant.id] = pick.qty;
        return next;
      });
      if (pickerMode === 'cart') {
        setPickerOpen(false);
        const count = added.reduce((n, pick) => n + pick.qty, 0);
        showToast(count > 1 ? `ใส่ตะกร้าแล้ว ${count} ชิ้น` : 'ใส่ตะกร้าแล้ว');
        return;
      }
      toggleAll(false);
      for (const pick of added) {
        toggleLine(pick.variant.id, warehouseFor(pick.variant));
      }
      setPickerOpen(false);
      router.push('/shop/checkout');
    },
    [addToCart, totalAvailable, cartQtyOf, warehouseFor, pickerMode, showToast, toggleAll, toggleLine],
  );

  const onChat = useCallback(() => {
    if (!master || !activeVariant) return;
    const shopId = master.ownerShopId?.trim() || shopKeyOf(master);
    const conversationId = startShopConversation({
      shopId,
      shopName: master.shopName,
      sellerId: shopId,
      avatarColor: colors.brand.primaryDark,
    });
    sendProductCard(conversationId, chatProductCardOf(master, activeVariant));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    jumpToChatThread(conversationId);
  }, [master, activeVariant, startShopConversation, sendProductCard]);

  const onShareProduct = useCallback(() => {
    if (!master) return;
    void Share.share({
      title: master.title,
      message: promoShareProduct({
        title: master.title,
        price: displayPrice,
        shopName: master.shopName,
      }),
    });
  }, [master, displayPrice]);

  const onShareShop = useCallback(() => {
    if (!master) return;
    void Share.share({
      title: master.shopName,
      message: promoShareShop(master.shopName),
    });
  }, [master]);

  const onViewShop = useCallback(() => {
    if (!master) return;
    router.push({ pathname: '/shop/store/[shopKey]', params: { shopKey: shopKeyOf(master) } });
  }, [master]);

  const shopHandle = master ? shopHandleOf(master) : '';
  const following = shopHandle ? isFollowing(shopHandle) : false;
  const onToggleFollow = useCallback(() => {
    if (!shopHandle) return;
    void Haptics.selectionAsync();
    if (following) unfollow(shopHandle);
    else follow(shopHandle);
  }, [shopHandle, following, follow, unfollow]);

  const headerBlock = useMemo(() => {
    if (!master) return null;
    const condition = conditionBadge(master);
    const verified = master.channel !== 'C2C';

    return (
      <View>
        <View style={styles.heroWrap}>
          <FlatList
            ref={heroRef}
            data={gallery}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.key}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            onMomentumScrollEnd={onHeroScroll}
            onScrollToIndexFailed={({ index }) => {
              heroRef.current?.scrollToOffset({ offset: index * SCREEN_W, animated: true });
            }}
            renderItem={({ item }) => {
              const overlay = overlayForSlide(item, itemVariants, activeVariant);
              if (item.type === 'video') {
                return (
                  <View style={styles.heroImage}>
                    <ProductVideoThumb
                      uri={displayMediaUri(item.uri)}
                      poster={item.thumbnailUri ? displayMediaUri(item.thumbnailUri) : undefined}
                      style={styles.heroImage}
                      autoPlay
                      contentFit="contain"
                    />
                    <DimensionOverlay overlay={overlay} />
                  </View>
                );
              }
              return (
                <Pressable onPress={() => setZoomOpen(true)}>
                  <Image
                    source={{ uri: displayMediaUri(item.uri) }}
                    style={styles.heroImage}
                    resizeMode="cover"
                  />
                  <DimensionOverlay overlay={overlay} />
                </Pressable>
              );
            }}
          />

          {itemVariants.length > 0 ? (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.58)']}
              locations={[0, 1]}
              style={styles.miniOverlay}
              pointerEvents="box-none"
            >
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={styles.miniStrip}
              >
                {itemVariants.map((v) => {
                  const selected = v.id === (variantId ?? activeVariant?.id);
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => onSelectVariant(v)}
                      style={styles.miniChip}
                    >
                      <Image
                        source={{ uri: displayMediaUri(variantImageUri(master, v)) }}
                        style={[styles.miniThumb, selected && styles.miniThumbOn]}
                      />
                      <Text style={[styles.miniLabel, selected && styles.miniLabelOn]} numberOfLines={1}>
                        {v.attrs.color || v.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.heroCount}>
                <Text style={styles.heroCountText}>
                  {gallery.length ? heroIndex + 1 : 0}/{gallery.length}
                </Text>
              </View>
            </LinearGradient>
          ) : (
            <View style={styles.heroCountSolo}>
              <Text style={styles.heroCountText}>
                {gallery.length ? heroIndex + 1 : 0}/{gallery.length}
              </Text>
            </View>
          )}
        </View>

        {gallery.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.mediaStrip}
            contentContainerStyle={styles.mediaStripContent}
          >
            {gallery.map((slide, idx) => {
              const active = idx === heroIndex;
              const isVideo = slide.type === 'video';
              const thumb = displayMediaUri(
                isVideo
                  ? (thumbnailUriOf({
                      type: slide.type,
                      uri: slide.uri,
                      thumbnailUri: slide.thumbnailUri,
                    }) ?? slide.uri)
                  : slide.uri,
              );

              return (
                <Pressable
                  key={slide.key}
                  onPress={() => {
                    setHeroIndex(idx);
                    heroRef.current?.scrollToIndex({ index: idx, animated: true });
                  }}
                  style={[styles.mediaThumbWrap, active && styles.mediaThumbOn]}
                  accessibilityLabel={isVideo ? `ดูวิดีโอ ${idx + 1}` : `ดูรูป ${idx + 1}`}
                >
                  <Image source={{ uri: thumb }} style={styles.mediaThumb} resizeMode="cover" />
                  {isVideo ? (
                    <View style={styles.mediaThumbPlay} pointerEvents="none">
                      <Ionicons name="play" size={10} color="#fff" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.priceCard}>

          <View style={styles.priceRow}>
            <Text style={styles.priceNow}>{displayPrice}</Text>
            <View style={styles.conditionPill}>
              <Text style={styles.conditionText}>{condition}</Text>
            </View>
          </View>
          {showRangeHint ? <Text style={styles.priceRangeHint}>{rangeLabel}</Text> : null}
          {quoteMerchandise > 0 ? (
            <Text style={styles.freightLine}>
              {quote.shippingPayable === 0 ? 'ส่งฟรี' : `ค่าส่ง ${formatTHB(quote.shippingPayable)}`}
              {quote.saved > 0 ? ` · ประหยัด ${formatTHB(quote.saved)}` : ''}
            </Text>
          ) : null}
          <Text style={styles.title}>{master.title}</Text>
          {master.brand ? <Text style={styles.brandLine}>{master.brand}</Text> : null}
          {itemVariants.length > 0 ? (
            <Pressable style={styles.pickRow} onPress={() => openPicker('cart')}>
              <Text style={styles.pickLabel}>ตัวเลือก</Text>
              <Text style={styles.pickValue} numberOfLines={1}>
                {pickedVariant
                  ? selectedSpecTitle(pickedVariant)
                  : 'เลือกสี / สเปก / ขนาด'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.merchantRow}>
            <Image source={{ uri: shopAvatarUri(shopKey) }} style={styles.merchantAvatar} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.merchantNameRow}>
                <Text style={styles.merchantName} numberOfLines={1}>
                  {master.shopName}
                </Text>
                {verified ? (
                  <Ionicons name="checkmark-circle" size={16} color={colors.accent.info} />
                ) : null}
              </View>
              <Text style={styles.merchantMeta}>
                ★ {ratingOf(shopKey)} · {shopProducts.length + 1} สินค้า
              </Text>
            </View>
            <Pressable onPress={onShareShop} hitSlop={8} accessibilityLabel="แชร์ร้านค้า">
              <Ionicons name="share-outline" size={18} color={colors.text.secondary} />
            </Pressable>
          </View>
          <View style={styles.merchantActions}>
            <Pressable
              style={[styles.merchantBtn, following && styles.merchantBtnOn]}
              onPress={onToggleFollow}
            >
              <Text style={[styles.merchantBtnText, following && styles.merchantBtnTextOn]}>
                {following ? 'กำลังติดตาม' : 'ติดตาม'}
              </Text>
            </Pressable>
            <Pressable style={styles.merchantBtn} onPress={onViewShop}>
              <Text style={styles.merchantBtnText}>ดูร้านค้า</Text>
            </Pressable>
          </View>
          {recommended.length > 0 ? (
            <>
              <Text style={styles.recTitle}>สินค้าแนะนำจากร้านนี้</Text>
              <View style={styles.recGrid}>
                {recommended.map((m) => (
                  <RecThumb
                    key={m.id}
                    master={m}
                    price={priceOf(m)}
                    width={REC_W}
                    onPress={() => openProduct(m.id)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Pressable style={styles.accordionHead} onPress={() => setSpecsOpen((v) => !v)}>
            <Text style={styles.sectionTitle}>สเปกเทคนิค</Text>
            <Ionicons name={specsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.muted} />
          </Pressable>
          {specsOpen ? (
            <>
              {specs.length ? (
                specs.map((row, i) => (
                  <View key={row.key} style={[styles.specRow, i === 0 && { borderTopWidth: 0 }]}>
                    <Text style={styles.specLabel}>{row.label}</Text>
                    <Text style={styles.specValue}>{row.value}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyHint}>ยังไม่มีสเปกเพิ่มเติม</Text>
              )}
              {(master.specImages ?? [])
                .filter((item) => item.type === 'image')
                .map((item) => (
                  <Image key={item.uri} source={{ uri: item.uri }} style={styles.descImage} />
                ))}
            </>
          ) : null}

          <Pressable
            style={[styles.accordionHead, { marginTop: 8 }]}
            onPress={() => setDescOpen((v) => !v)}
          >
            <Text style={styles.sectionTitle}>รายละเอียดโดยรวม</Text>
            <Ionicons name={descOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.muted} />
          </Pressable>
          {descOpen ? (
            <Text style={styles.descBody}>
              {master.description?.trim() ||
                (master.tags.length ? master.tags.join(' · ') : 'ผู้ขายยังไม่ได้เขียนรายละเอียด')}
            </Text>
          ) : null}

          <Pressable
            style={[styles.accordionHead, { marginTop: 8 }]}
            onPress={() => setUsageOpen((v) => !v)}
          >
            <Text style={styles.sectionTitle}>วิธีการใช้</Text>
            <Ionicons name={usageOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.muted} />
          </Pressable>
          {usageOpen ? (
            <>
              <Text style={styles.descBody}>
                {master.usageGuide?.trim() || 'ผู้ขายยังไม่ได้เขียนวิธีใช้'}
              </Text>
              {(master.usageImages ?? [])
                .filter((item) => item.type === 'image')
                .map((item) => (
                  <Image key={item.uri} source={{ uri: item.uri }} style={styles.descImage} />
                ))}
            </>
          ) : null}

          <Pressable style={styles.reportLink} onPress={() => setReportOpen(true)}>
            <Ionicons name="flag-outline" size={14} color={colors.text.muted} />
            <Text style={styles.reportLinkText}>รายงานสินค้า</Text>
          </Pressable>
        </View>

        {relatedAll.length > 0 ? (
          <Text style={styles.relatedHeading}>สินค้าใกล้เคียง</Text>
        ) : (
          <View style={{ height: 12 }} />
        )}
      </View>
    );
  }, [
    master,
    gallery,
    heroIndex,
    displayPrice,
    showRangeHint,
    rangeLabel,
    itemVariants,
    variantId,
    pickedVariant,
    activeVariant,
    onSelectVariant,
    onHeroScroll,
    openPicker,
    shopKey,
    shopProducts.length,
    recommended,
    priceOf,
    openProduct,
    onViewShop,
    onShareShop,
    onToggleFollow,
    following,
    quote,
    quoteMerchandise,
    specs,
    specsOpen,
    descOpen,
    usageOpen,
    relatedAll.length,
  ]);

  if (!master) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingHorizontal: 16 }}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.missing}>ไม่พบสินค้านี้</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={related.length ? [{ id: 'related-grid' }] : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={headerBlock}
        contentContainerStyle={{ paddingBottom: insets.bottom + 92 }}
        onScroll={onPageScroll}
        scrollEventThrottle={16}
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (relatedCount < relatedAll.length) setRelatedCount((n) => n + RELATED_PAGE);
        }}
        renderItem={() => (
          <View style={[styles.recGrid, { paddingHorizontal: H_PAD }]}>
            {related.map((item) => (
              <RecThumb
                key={item.id}
                master={item}
                price={priceOf(item)}
                width={REC_W}
                onPress={() => openProduct(item.id)}
              />
            ))}
          </View>
        )}
        ListFooterComponent={
          relatedCount < relatedAll.length ? (
            <Text style={styles.loadingMore}>กำลังโหลดสินค้าเพิ่ม…</Text>
          ) : related.length ? (
            <Text style={styles.loadingMore}>หมดรายการแล้ว</Text>
          ) : null
        }
      />

      <View
        style={[
          styles.topOverlay,
          { paddingTop: insets.top + 6 },
          compact && styles.topOverlaySolid,
        ]}
        pointerEvents="box-none"
      >
        <OverlayBtn
          icon="chevron-back"
          compact={compact}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/shop'))}
          label="ย้อนกลับ"
        />
        <View style={{ flex: 1 }} />
        <OverlayBtn icon="share-outline" compact={compact} onPress={onShareProduct} label="แชร์สินค้า" />
        <OverlayBtn
          icon="cart-outline"
          compact={compact}
          badge={lineCount}
          onPress={() => router.push('/shop/cart')}
          label="ตะกร้า"
        />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={styles.chatBtn} onPress={onChat}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text.primary} />
          <Text style={styles.chatBtnText}>แชต</Text>
        </Pressable>
        <Pressable
          style={[styles.cartAction, allOut && styles.actionDisabled]}
          onPress={onAddCart}
          disabled={allOut}
        >
          <Text style={styles.cartActionText}>ใส่ตะกร้า</Text>
        </Pressable>
        <Pressable
          style={[styles.buyAction, allOut && styles.actionDisabled]}
          onPress={onBuyNow}
          disabled={allOut}
        >
          <Text style={styles.buyActionText}>ซื้อเลย</Text>
        </Pressable>
      </View>

      {toast ? (
        <View style={[styles.toast, { bottom: 64 + insets.bottom }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <ZoomGalleryModal
        visible={zoomOpen}
        slides={gallery}
        index={heroIndex}
        onIndexChange={(next) => {
          setHeroIndex(next);
          heroRef.current?.scrollToIndex({ index: next, animated: false });
          const slide = gallery[next];
          if (slide?.variantId) {
            const match = itemVariants.find((v) => v.id === slide.variantId);
            if (match) setVariantId(match.id);
          }
        }}
        onClose={() => setZoomOpen(false)}
      />

      <ReportBlockSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        kind="content"
        targetId={master.id}
        targetLabel={master.title}
        blockUserId={shopHandleOf(master)}
      />

      {activeVariant ? (
        <VariantPickerSheet
          visible={pickerOpen}
          mode={pickerMode}
          onClose={() => setPickerOpen(false)}
          master={master}
          variants={itemVariants}
          variant={activeVariant}
          onSelectVariant={onSelectVariant}
          variantStock={totalAvailable}
          cartQtyOf={cartQtyOf}
          fieldDefs={fieldDefs}
          onConfirm={confirmPicker}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5F7' },
  missing: { marginTop: 40, textAlign: 'center', color: colors.text.muted, fontWeight: '700' },
  heroWrap: { width: SCREEN_W, height: HERO_H, backgroundColor: '#111', overflow: 'hidden' },
  heroImage: { width: SCREEN_W, height: HERO_H },
  miniOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 36,
    paddingBottom: 8,
    paddingRight: 8,
  },
  miniStrip: {
    paddingLeft: 8,
    paddingRight: 8,
    gap: 6,
    alignItems: 'flex-end',
  },
  miniChip: { width: 46, alignItems: 'center', gap: 3 },
  miniThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  miniThumbOn: { borderColor: ORANGE, borderWidth: 2 },
  miniLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    width: 46,
  },
  miniLabelOn: { color: ORANGE },
  heroCount: {
    marginBottom: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroCountSolo: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  mediaStrip: { backgroundColor: '#fff', paddingVertical: 8 },
  mediaStripContent: { paddingHorizontal: H_PAD, gap: 6 },
  mediaThumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border.soft,
    backgroundColor: '#EEE',
    overflow: 'hidden',
  },
  mediaThumbOn: { borderColor: ORANGE, borderWidth: 2 },
  mediaThumb: { width: 52, height: 52 },
  mediaThumbPlay: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceCard: {

    backgroundColor: '#fff',
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 18,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceNow: { flex: 1, fontSize: 26, fontWeight: '900', color: ORANGE },
  priceRangeHint: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.text.muted },
  freightLine: { marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.brand.primaryDark },
  conditionPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.brand.mist,
  },
  conditionText: { fontSize: 12, fontWeight: '800', color: colors.brand.primaryDark },
  title: { marginTop: 10, fontSize: 18, fontWeight: '800', color: colors.text.primary, lineHeight: 24 },
  brandLine: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  pickRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F7F8F8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickLabel: { fontSize: 13, fontWeight: '800', color: colors.text.secondary },
  pickValue: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text.primary },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(10,22,17,0.88)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 20,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  sectionCard: {
    marginTop: 10,
    marginHorizontal: 10,
    backgroundColor: '#fff',
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#0A1611',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  merchantAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#DDD' },
  merchantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  merchantName: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.text.primary },
  merchantMeta: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  merchantActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  merchantBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantBtnOn: { backgroundColor: colors.brand.mist, borderColor: colors.brand.mist },
  merchantBtnText: { fontSize: 13, fontWeight: '800', color: colors.brand.primaryDark },
  merchantBtnTextOn: { color: colors.brand.primaryDark },
  recTitle: { marginTop: 16, marginBottom: 10, fontSize: 13, fontWeight: '800', color: colors.text.primary },
  recGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: REC_GAP },
  recCard: { overflow: 'hidden', paddingBottom: 6 },
  recThumb: { backgroundColor: '#EEE' },
  recTitleText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    minHeight: 32,
    color: colors.text.primary,
  },
  recPrice: { marginTop: 2, fontSize: 13, fontWeight: '800', color: ORANGE },
  accordionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  specRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  specLabel: { width: 120, fontSize: 13, color: colors.text.secondary, fontWeight: '600' },
  specValue: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text.primary },
  descBody: { marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.text.primary },
  descImage: { marginTop: 10, width: '100%', height: 220, borderRadius: 10, backgroundColor: '#EEE' },
  emptyHint: { marginTop: 8, fontSize: 13, color: colors.text.muted },
  reportLink: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  reportLinkText: { fontSize: 12, fontWeight: '700', color: colors.text.muted },
  relatedHeading: {
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: H_PAD,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  loadingMore: { textAlign: 'center', paddingVertical: 16, color: colors.text.muted, fontWeight: '700' },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  topOverlaySolid: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  overlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBtnCompact: { backgroundColor: 'rgba(10,22,17,0.06)' },
  overlayBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BUY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  overlayBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  chatBtn: { width: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  chatBtnText: { fontSize: 11, fontWeight: '800', color: colors.text.primary },
  cartAction: {
    flex: 1.1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFB000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartActionText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  buyAction: {
    flex: 1.2,
    height: 44,
    borderRadius: 12,
    backgroundColor: BUY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyActionText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  actionDisabled: { opacity: 0.4 },
});
