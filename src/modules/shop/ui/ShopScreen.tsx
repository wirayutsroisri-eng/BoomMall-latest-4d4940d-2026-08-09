import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
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
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { fromLegacyImages } from '@/modules/commerce/domain/product-media';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useCartStore } from '@/modules/commerce/state/cart-store';
import type { MasterSku } from '@/modules/commerce/domain/types';
import { colors } from '@/shared/theme/colors';
import {
  ENABLE_COMING_SOON_SHOP_CHROME,
  ENABLE_PAYLATER_AND_CREDIT_UI,
} from '@/shared/compliance/appStoreGates';
import { ProductCardMediaCarousel } from '@/modules/shop/ui/product/ProductCardMediaCarousel';

const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 12;
const GRID_GAP = 8;
const COL_W = (SCREEN_W - H_PAD * 2 - GRID_GAP) / 2;

type CategoryKey =
  | 'all'
  | 'mall'
  | 'new'
  | 'electronics'
  | 'used'
  | 'wholesale'
  | 'battery'
  | 'parts'
  | 'b2b';

const CATEGORIES: Array<{ key: CategoryKey; label: string }> = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'new', label: 'มือหนึ่ง' },
  { key: 'used', label: 'มือสอง' },
  { key: 'battery', label: 'แบตเตอรี่' },
  { key: 'parts', label: 'อะไหล่' },
  { key: 'electronics', label: 'อิเล็กทรอนิกส์' },
];

const QUICK_TOOLS_ALL: Array<{
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  dot?: boolean;
  shipping?: boolean;
}> = [
  { key: 'orders', label: 'คำสั่งซื้อ', icon: 'receipt-outline' },
  { key: 'coupons', label: 'คูปอง', icon: 'ticket-outline' },
  { key: 'messages', label: 'ข้อความ', icon: 'chatbubble-ellipses-outline', dot: true },
  { key: 'paylater', label: 'PayLater', icon: 'card-outline', badge: '+20K' },
  { key: 'bonus', label: 'โบนัส', icon: 'diamond-outline' },
  { key: 'returns', label: 'คืนสินค้า', icon: 'return-down-back-outline' },
];

const FEATURE_CHIPS_ALL: Array<{
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
}> = [
  { key: 'shipping', label: 'คูปองส่ง', icon: 'car-outline', colors: ['#2E8CFF', '#5BB0FF'] },
  { key: 'live', label: 'Live ช้อป', icon: 'play', colors: ['#FE2C55', '#FF6B8A'] },
  { key: 'mall', label: 'Boom Mall', icon: 'storefront', colors: ['#1A1A1A', '#3A3A3A'] },
  { key: 'following', label: 'กำลังติดตาม', icon: 'heart', colors: ['#FF3B4A', '#FF7A84'] },
  { key: 'flash', label: 'Flash Sale', icon: 'flash', colors: ['#FF8A00', '#FFB347'] },
];

const QUICK_TOOLS = QUICK_TOOLS_ALL.filter((t) => {
  if (t.key === 'paylater' && !ENABLE_PAYLATER_AND_CREDIT_UI) return false;
  if (
    !ENABLE_COMING_SOON_SHOP_CHROME &&
    (t.key === 'coupons' || t.key === 'bonus' || t.key === 'returns' || t.key === 'paylater')
  ) {
    return false;
  }
  return true;
});

const FEATURE_CHIPS = FEATURE_CHIPS_ALL.filter((c) => {
  if (
    !ENABLE_COMING_SOON_SHOP_CHROME &&
    (c.key === 'shipping' || c.key === 'live' || c.key === 'flash' || c.key === 'following')
  ) {
    return false;
  }
  return true;
});

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

function matchesCategory(m: MasterSku, cat: CategoryKey) {
  if (cat === 'all') return true;
  if (cat === 'b2b' || cat === 'wholesale') return m.channel === 'B2B';
  if (cat === 'mall') return m.channel === 'B2C' || m.channel === 'B2B';
  if (cat === 'used') {
    return (
      m.channel === 'C2C' ||
      m.tags.some((t) => /used|มือสอง|second|pre-?loved|c2c/i.test(t)) ||
      /มือสอง|used|สภาพดี|มือ 2/.test(m.title)
    );
  }
  if (cat === 'new') {
    if (m.tags.some((t) => /มือสอง|used|c2c/i.test(t))) return false;
    if (m.tags.some((t) => /มือหนึ่ง|new|ใหม่|แบรนด์แท้/i.test(t))) return true;
    return m.channel !== 'C2C';
  }
  const hay = `${m.title} ${m.tags.join(' ')} ${m.categoryKey ?? ''}`.toLowerCase();
  if (cat === 'battery') return /battery|lifepo4|แบต|pack|bms/.test(hay);
  if (cat === 'parts') return /brake|cnc|rim|shock|อะไหล่|parts|controller|motor/.test(hay);
  if (cat === 'electronics') return /charger|display|gps|controller|converter|อิเล็กทรอนิกส์/.test(hay);
  return true;
}

function discountOf(master: MasterSku) {
  // Deterministic mock discount for UI richness (doesn't change price math)
  const n = master.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return [7, 15, 25, 35, 50, 61, 81][n % 7];
}

function ratingOf(master: MasterSku) {
  const n = master.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return (4.5 + (n % 5) * 0.1).toFixed(1);
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function ShopScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryKey>('all');
  const [flashLeft, setFlashLeft] = useState(2 * 3600 + 14 * 60 + 37);

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const totalAvailable = useInventoryStore((s) => s.totalAvailable);
  const lines = useCartStore((s) => s.lines);
  const lineCount = lines.reduce((n, l) => n + l.qty, 0);

  useEffect(() => {
    const id = setInterval(() => setFlashLeft((s) => (s > 0 ? s - 1 : 2 * 3600)), 1000);
    return () => clearInterval(id);
  }, []);

  const flashH = Math.floor(flashLeft / 3600);
  const flashM = Math.floor((flashLeft % 3600) / 60);
  const flashS = flashLeft % 60;

  const variantsByMaster = useMemo(() => {
    const map = new Map<string, typeof variants>();
    for (const v of variants) {
      const list = map.get(v.masterSkuId);
      if (list) list.push(v);
      else map.set(v.masterSkuId, [v]);
    }
    return map;
  }, [variants]);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return masters.filter((m) => {
      if (!matchesCategory(m, category)) return false;
      if (!q) return true;
      const vs = variantsByMaster.get(m.id) ?? [];
      return (
        m.title.toLowerCase().includes(q) ||
        m.masterSku.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        vs.some((v) => v.sku.toLowerCase().includes(q) || v.label.toLowerCase().includes(q))
      );
    });
  }, [masters, category, query, variantsByMaster]);

  const dealProducts = useMemo(() => products.slice(0, 4), [products]);
  const flashProducts = useMemo(() => products.slice(2, 6), [products]);

  const openProduct = (productId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/shop/product/[id]', params: { id: productId } });
  };

  const openCart = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/shop/cart');
  };

  const notifySoon = (label: string) => {
    void Haptics.selectionAsync();
    Alert.alert(label, 'ฟีเจอร์นี้กำลังเตรียมในรอบถัดไป');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      {/* Search + Cart */}
      <View style={styles.searchRow}>
        <Pressable style={styles.searchBox} onPress={() => router.push('/search')}>
          <Ionicons name="search" size={16} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาสินค้า, SKU, แบรนด์"
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          <Pressable hitSlop={8} onPress={() => router.push('/shop/image-search')}>
            <Ionicons name="camera-outline" size={18} color={colors.text.secondary} />
          </Pressable>
          <Pressable
            style={styles.searchBtn}
            onPress={() => {
              void Haptics.selectionAsync();
            }}
          >
            <Text style={styles.searchBtnText}>ค้นหา</Text>
          </Pressable>
        </Pressable>
        <Pressable style={styles.cartBtn} onPress={openCart} hitSlop={6}>
          <Ionicons name="cart-outline" size={26} color={colors.text.primary} />
          {lineCount > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{lineCount > 99 ? '99+' : lineCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {/* Quick tools */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolsRow}
        >
          {QUICK_TOOLS.map((tool) => (
            <Pressable
              key={tool.key}
              style={styles.toolItem}
              onPress={() => {
                if (tool.key === 'messages') {
                  router.push('/(tabs)/chat');
                  return;
                }
                if (tool.key === 'orders') {
                  router.push('/orders');
                  return;
                }
                notifySoon(tool.label);
              }}
            >
              <View style={styles.toolIconWrap}>
                <Ionicons name={tool.icon} size={22} color={colors.text.primary} />
                {tool.dot ? <View style={styles.toolDot} /> : null}
                {tool.badge ? (
                  <View style={styles.toolBadge}>
                    <Text style={styles.toolBadgeText}>{tool.badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.toolLabel} numberOfLines={1}>
                {tool.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Feature chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featureRow}
        >
          {FEATURE_CHIPS.map((chip) => (
            <Pressable
              key={chip.key}
              style={styles.featureItem}
              onPress={() => {
                if (chip.key === 'flash') setCategory('all');
                else if (chip.key === 'mall') setCategory('mall');
                else notifySoon(chip.label);
              }}
            >
              <LinearGradient colors={chip.colors} style={styles.featureCircle}>
                <Ionicons name={chip.icon} size={18} color="#fff" />
              </LinearGradient>
              <Text style={styles.featureLabel} numberOfLines={1}>
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Promo split */}
        <View style={styles.promoRow}>
          <View style={styles.promoCard}>
            <Text style={styles.promoTitle}>แบรนด์ดัง ลดแรง</Text>
            <View style={styles.promoItems}>
              {dealProducts.slice(0, 2).map((m) => {
                const off = discountOf(m);
                return (
                  <Pressable key={m.id} style={styles.promoItem} onPress={() => openProduct(m.id)}>
                    <Image
                      source={{ uri: m.imageUri ?? masterContentImage(m.id) }}
                      style={styles.promoThumb}
                    />
                    <View style={styles.offBadge}>
                      <Text style={styles.offBadgeText}>-{off}%</Text>
                    </View>
                    <Text style={styles.promoPrice}>{formatTHB(m.basePrice)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.promoCard, styles.flashCard]}>
            <View style={styles.flashHeader}>
              <Text style={styles.promoTitle}>Flash Sale</Text>
              <View style={styles.timerRow}>
                <View style={styles.timerBox}>
                  <Text style={styles.timerText}>{pad2(flashH)}</Text>
                </View>
                <Text style={styles.timerColon}>:</Text>
                <View style={styles.timerBox}>
                  <Text style={styles.timerText}>{pad2(flashM)}</Text>
                </View>
                <Text style={styles.timerColon}>:</Text>
                <View style={styles.timerBox}>
                  <Text style={styles.timerText}>{pad2(flashS)}</Text>
                </View>
              </View>
            </View>
            <View style={styles.promoItems}>
              {flashProducts.slice(0, 2).map((m) => {
                const soldPct = 35 + (m.id.charCodeAt(m.id.length - 1) % 50);
                return (
                  <Pressable key={m.id} style={styles.promoItem} onPress={() => openProduct(m.id)}>
                    <Image
                      source={{ uri: m.imageUri ?? masterContentImage(m.id) }}
                      style={styles.promoThumb}
                    />
                    <View style={styles.hotBadge}>
                      <Text style={styles.hotBadgeText}>Hot</Text>
                    </View>
                    <View style={styles.soldBarTrack}>
                      <View style={[styles.soldBarFill, { width: `${soldPct}%` }]} />
                    </View>
                    <Text style={styles.promoPriceHot}>{formatTHB(m.basePrice)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
        >
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <Pressable
                key={c.key}
                style={styles.catItem}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setCategory(c.key);
                }}
              >
                <Text style={[styles.catText, active && styles.catTextActive]}>{c.label}</Text>
                {active ? <View style={styles.catUnderline} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Product grid */}
        <View style={styles.grid}>
          {products.map((master, index) => {
            const vs = variantsByMaster.get(master.id) ?? [];
            const price = vs.length ? Math.min(...vs.map((v) => v.price)) : master.basePrice;
            const compareAt = Math.round(price * (1 + discountOf(master) / 100));
            const off = discountOf(master);
            const isVideoStyle = index % 3 === 0;
            const stock = vs.reduce((s, v) => s + totalAvailable(v.id), 0);
            const media = master.media?.length
              ? master.media
              : fromLegacyImages(master.imageUris, master.imageUri ?? masterContentImage(master.id));

            return (
              <Pressable
                key={master.id}
                style={styles.productCard}
                onPress={() => openProduct(master.id)}
                onLongPress={() =>
                  Alert.alert(
                    master.title,
                    [
                      master.shopName,
                      `${vs.length || 1} SKU · คงเหลือ ${stock}`,
                      master.description ?? master.tags.join(' · '),
                    ].join('\n'),
                  )
                }
              >
                <View style={styles.productVisual}>
                  <ProductCardMediaCarousel
                    media={media}
                    size={COL_W}
                    aspect="square"
                    onPress={() => openProduct(master.id)}
                  />
                  {isVideoStyle ? (
                    <View style={styles.adBadge}>
                      <Text style={styles.adBadgeText}>Ad</Text>
                    </View>
                  ) : (
                    <View style={styles.discountCorner}>
                      <Text style={styles.discountCornerText}>-{off}%</Text>
                    </View>
                  )}
                </View>

                <View style={styles.productBody}>
                  {!isVideoStyle ? (
                    <View style={styles.badgeRow}>
                      <Text style={styles.topChoice}>TopChoice</Text>
                      <Text style={styles.mallTag}>(Mall)</Text>
                    </View>
                  ) : null}

                  <Text style={styles.productTitle} numberOfLines={2}>
                    {master.title}
                  </Text>

                  <View style={styles.priceRow}>
                    <Text style={styles.salePrice}>{formatTHB(price)}</Text>
                    <Text style={styles.comparePrice}>{formatTHB(compareAt)}</Text>
                  </View>

                  <View style={styles.trustRow}>
                    <View style={styles.trustChip}>
                      <Text style={styles.trustChipText}>ส่งฟรี</Text>
                    </View>
                    <View style={styles.trustChip}>
                      <Text style={styles.trustChipText}>COD</Text>
                    </View>
                    <View style={styles.ratingChip}>
                      <Ionicons name="star" size={10} color="#F5A524" />
                      <Text style={styles.ratingText}>{ratingOf(master)}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {!products.length ? (
          <Text style={styles.empty}>ไม่พบสินค้าที่ตรงกับตัวกรอง</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: H_PAD,
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 4,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    paddingVertical: 0,
  },
  searchBtn: {
    backgroundColor: colors.accent.live,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  searchBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  cartBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#F5F5F5',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  toolsRow: {
    paddingHorizontal: H_PAD,
    gap: 14,
    paddingBottom: 12,
  },
  toolItem: {
    width: 58,
    alignItems: 'center',
    gap: 5,
  },
  toolIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  toolDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent.live,
  },
  toolBadge: {
    position: 'absolute',
    top: -2,
    right: -6,
    backgroundColor: colors.accent.live,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  toolBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
  },
  toolLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  featureRow: {
    paddingHorizontal: H_PAD,
    gap: 14,
    paddingBottom: 14,
  },
  featureItem: {
    width: 64,
    alignItems: 'center',
    gap: 5,
  },
  featureCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  promoRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: H_PAD,
    marginBottom: 10,
  },
  promoCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  flashCard: {
    borderWidth: 1,
    borderColor: 'rgba(254,44,85,0.18)',
  },
  promoTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
  },
  flashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  timerBox: {
    backgroundColor: colors.brand.ink,
    borderRadius: 4,
    minWidth: 18,
    paddingHorizontal: 3,
    paddingVertical: 2,
    alignItems: 'center',
  },
  timerText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  timerColon: {
    color: colors.brand.ink,
    fontWeight: '900',
    fontSize: 10,
  },
  promoItems: {
    flexDirection: 'row',
    gap: 8,
  },
  promoItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  promoThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#E8EEEA',
  },
  offBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: colors.accent.live,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  offBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  hotBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#FF8A00',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  hotBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  soldBarTrack: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F0D0D6',
    overflow: 'hidden',
  },
  soldBarFill: {
    height: '100%',
    backgroundColor: colors.accent.live,
  },
  promoPrice: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.primary,
  },
  promoPriceHot: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.accent.live,
  },
  catRow: {
    paddingHorizontal: H_PAD,
    gap: 16,
    paddingTop: 4,
    paddingBottom: 10,
    alignItems: 'flex-end',
  },
  catItem: {
    paddingBottom: 6,
    alignItems: 'center',
  },
  catText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.muted,
  },
  catTextActive: {
    color: colors.text.primary,
    fontWeight: '900',
  },
  catUnderline: {
    position: 'absolute',
    bottom: 0,
    width: 22,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.text.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
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
    aspectRatio: 0.92,
    backgroundColor: '#E8EEEA',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  adBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
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
  playHint: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountCorner: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.accent.live,
    borderBottomRightRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  discountCornerText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  productBody: {
    padding: 8,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topChoice: {
    fontSize: 10,
    fontWeight: '900',
    color: '#C9A227',
  },
  mallTag: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.brand.primaryDark,
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
    gap: 6,
  },
  salePrice: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.accent.live,
  },
  comparePrice: {
    fontSize: 11,
    color: colors.text.muted,
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  trustChip: {
    backgroundColor: '#FFF0F3',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  trustChipText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accent.live,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.secondary,
  },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    marginTop: 28,
    fontSize: 13,
  },
});
