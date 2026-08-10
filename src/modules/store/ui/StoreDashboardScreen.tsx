import React, { useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import type { MasterSku } from '@/modules/commerce/domain/types';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { ORDER_STATUS_LABEL } from '@/modules/store/domain/types';
import { colors } from '@/shared/theme/colors';

const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 14;
const GRID_GAP = 10;
const COLS = 2;
const CARD_W = (SCREEN_W - H_PAD * 2 - GRID_GAP * (COLS - 1)) / COLS;
/** รูปสินค้าขนาดมาตรฐาน 1:1 */
const IMAGE_SIZE = Math.round(CARD_W);
const INFO_H = 88;
const CARD_H = IMAGE_SIZE + INFO_H;
const LOW_STOCK = 8;

type StockTone = 'ready' | 'low' | 'out';
type ToneFilter = 'all' | StockTone;

type BaseCategoryKey =
  | 'motor'
  | 'controller'
  | 'battery'
  | 'parts'
  | 'apparel'
  | 'bag'
  | 'custom';

type CategoryKey = 'all' | BaseCategoryKey | `user:${string}`;

const BASE_CATEGORIES: Array<{ key: BaseCategoryKey; label: string }> = [
  { key: 'motor', label: 'มอเตอร์' },
  { key: 'controller', label: 'กล่องควบคุม' },
  { key: 'battery', label: 'แบตเตอรี่' },
  { key: 'parts', label: 'อะไหล่' },
  { key: 'apparel', label: 'เสื้อผ้า' },
  { key: 'bag', label: 'กระเป๋า' },
  { key: 'custom', label: 'งานสั่งทำ / Custom' },
];

const CATEGORY_MATCH_ORDER: Array<[BaseCategoryKey, string[]]> = [
  ['controller', ['controller']],
  ['motor', ['conversion', 'motor', 'hub']],
  ['custom', ['custom', 'สั่งทำ']],
  ['bag', ['bag', 'กระเป๋า']],
  ['apparel', ['shirt', 'jacket', 'เสื้อ']],
  ['battery', ['lifepo4', 'bms', 'pack', 'cell', 'starter', 'fleet']],
  ['parts', ['brake', 'shock', 'rim', 'disc', 'cable', 'led', 'footpeg', 'cooling', 'display', 'charger', 'cnc']],
];

const TONE_LABEL: Record<ToneFilter, string> = {
  all: 'ทุกสถานะ',
  ready: 'พร้อมขาย',
  low: 'สต็อกต่ำ',
  out: 'หมดสต็อก',
};

const STOCK_DOT: Record<StockTone, string> = {
  ready: '#22C55E',
  low: '#F5A524',
  out: '#FF3B4A',
};

const CARD_GRADIENTS: Array<[string, string]> = [
  ['#0B3D2E', '#1A7A55'],
  ['#1A1A2E', '#3A4A5C'],
  ['#0F2A3A', '#1F6A7A'],
  ['#2A1A0F', '#6A4A2A'],
  ['#1A0F2A', '#4A2A6A'],
  ['#0F1F2A', '#2A4A5A'],
];

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

function stockTone(stock: number): StockTone {
  if (stock <= 0) return 'out';
  if (stock <= LOW_STOCK) return 'low';
  return 'ready';
}

function categoryOf(master: MasterSku): BaseCategoryKey {
  const hay = `${master.title} ${master.tags.join(' ')}`.toLowerCase();
  for (const [key, needles] of CATEGORY_MATCH_ORDER) {
    if (needles.some((n) => hay.includes(n))) return key;
  }
  return 'parts';
}

function matchesUserCategory(master: MasterSku, name: string) {
  const hay = `${master.title} ${master.tags.join(' ')}`.toLowerCase();
  return hay.includes(name.toLowerCase());
}

function hashTag(master: MasterSku) {
  const cat = categoryOf(master);
  const label = BASE_CATEGORIES.find((c) => c.key === cat)?.label ?? master.channel;
  return `#${label.replace(/\s+/g, '')}`;
}

type ProductActivity = {
  buyCount: number;
  askCount: number;
  total: number;
  buyLines: string[];
  askLines: string[];
};

type ChipItem = { key: CategoryKey; label: string };

const ADD_TILE_ID = '__add_product__';
type GridItem =
  | { kind: 'product'; id: string; product: MasterSku }
  | { kind: 'add'; id: typeof ADD_TILE_ID };

export function StoreDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<CategoryKey>('all');
  const [query, setQuery] = useState('');
  const [sortLatest, setSortLatest] = useState(true);
  const [toneFilter, setToneFilter] = useState<ToneFilter>('all');
  const [userCategories, setUserCategories] = useState<string[]>([]);

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const totalAvailable = useInventoryStore((s) => s.totalAvailable);
  const incomingOrders = useOrdersStore((s) => s.incomingOrders);
  const inquiries = useOrdersStore((s) => s.inquiries);
  const markProductAlertsSeen = useOrdersStore((s) => s.markProductAlertsSeen);

  const activityBySku = useMemo(() => {
    const map = new Map<string, ProductActivity>();
    const ensure = (id: string): ProductActivity => {
      let row = map.get(id);
      if (!row) {
        row = { buyCount: 0, askCount: 0, total: 0, buyLines: [], askLines: [] };
        map.set(id, row);
      }
      return row;
    };

    for (const order of incomingOrders) {
      if (order.status === 'cancelled' || order.status === 'delivered') continue;
      const row = ensure(order.masterSkuId);
      row.buyCount += 1;
      row.buyLines.push(
        `🛒 ${order.customerName} · ${ORDER_STATUS_LABEL[order.status]} · ${order.placedAt}`,
      );
    }

    for (const ask of inquiries) {
      if (!ask.unread) continue;
      const row = ensure(ask.masterSkuId);
      row.askCount += 1;
      row.askLines.push(`💬 ${ask.customerName}: ${ask.message}`);
    }

    for (const row of map.values()) row.total = row.buyCount + row.askCount;
    return map;
  }, [incomingOrders, inquiries]);

  const stockOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of masters) {
      map.set(
        m.id,
        m.variantIds.reduce((sum, vid) => sum + totalAvailable(vid), 0),
      );
    }
    return (m: MasterSku) => map.get(m.id) ?? 0;
  }, [masters, totalAvailable]);

  const stockByCategory = useMemo(() => {
    const counts = new Map<CategoryKey, number>();
    let total = 0;
    for (const m of masters) {
      const stock = stockOf(m);
      total += stock;
      const cat = categoryOf(m);
      counts.set(cat, (counts.get(cat) ?? 0) + stock);
      for (const name of userCategories) {
        if (matchesUserCategory(m, name)) {
          const key: CategoryKey = `user:${name}`;
          counts.set(key, (counts.get(key) ?? 0) + stock);
        }
      }
    }
    counts.set('all', total);
    return counts;
  }, [masters, stockOf, userCategories]);

  const chips = useMemo<ChipItem[]>(
    () => [
      { key: 'all', label: 'ทั้งหมด' },
      ...BASE_CATEGORIES.map((c) => ({ key: c.key as CategoryKey, label: c.label })),
      ...userCategories.map((name) => ({ key: `user:${name}` as CategoryKey, label: name })),
    ],
    [userCategories],
  );

  const inCategory = (m: MasterSku, cat: CategoryKey) => {
    if (cat === 'all') return true;
    if (cat.startsWith('user:')) return matchesUserCategory(m, cat.slice(5));
    return categoryOf(m) === cat;
  };

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = masters.filter((m) => {
      if (!inCategory(m, category)) return false;
      if (toneFilter !== 'all' && stockTone(stockOf(m)) !== toneFilter) return false;
      if (!q) return true;
      const catLabel = BASE_CATEGORIES.find((c) => c.key === categoryOf(m))?.label ?? '';
      return (
        m.title.toLowerCase().includes(q) ||
        m.masterSku.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        catLabel.toLowerCase().includes(q)
      );
    });
    // masters are prepended on create, so natural order is already newest-first
    if (!sortLatest) list = [...list].reverse();
    return list;
  }, [masters, category, query, sortLatest, toneFilter, stockOf, userCategories]);

  const gridItems = useMemo<GridItem[]>(
    () => [
      ...products.map((product) => ({
        kind: 'product' as const,
        id: product.id,
        product,
      })),
      { kind: 'add', id: ADD_TILE_ID },
    ],
    [products],
  );

  const openAddProduct = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const label = chips.find((c) => c.key === category)?.label ?? 'ทั้งหมด';
    router.push({
      pathname: '/create-details',
      params: { category, categoryLabel: label },
    });
  };

  const openAlerts = (master: MasterSku, activity: ProductActivity) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      master.title,
      [...activity.buyLines, ...activity.askLines].join('\n\n') ||
        'ยังไม่มีการแจ้งเตือนสำหรับสินค้านี้',
      [{ text: 'รับทราบ', onPress: () => markProductAlertsSeen(master.id) }],
    );
  };

  const shareStore = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync('https://boommall.app/shop/boomev_chanthaburi');
    Alert.alert('คัดลอกลิงก์แล้ว', 'ลิงก์หน้าร้านถูกคัดลอกแล้ว พร้อมแชร์');
  };

  const openToneFilter = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'ตัวกรองสถานะสต็อก',
      'เลือกสถานะที่ต้องการ (ใช้ร่วมกับหมวดหมู่ที่เลือกอยู่)',
      [
        ...(['all', 'ready', 'low', 'out'] as ToneFilter[]).map((t) => ({
          text: `${toneFilter === t ? '✓ ' : ''}${TONE_LABEL[t]}`,
          onPress: () => {
            void Haptics.selectionAsync();
            setToneFilter(t);
          },
        })),
        { text: 'ยกเลิก', style: 'cancel' as const },
      ],
    );
  };

  const addUserCategory = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.prompt(
      'สร้างหมวดหมู่ใหม่',
      'ตั้งชื่อหมวดหมู่ — ระบบจะรวมยอดสต็อกของสินค้าที่เข้าเงื่อนไขให้อัตโนมัติ',
      (text) => {
        const name = text?.trim();
        if (!name) return;
        const exists =
          userCategories.some((c) => c.toLowerCase() === name.toLowerCase()) ||
          BASE_CATEGORIES.some((c) => c.label === name);
        if (exists) {
          Alert.alert('มีหมวดหมู่นี้แล้ว', `"${name}" ถูกสร้างไว้แล้ว`);
          return;
        }
        setUserCategories((prev) => [...prev, name]);
        setCategory(`user:${name}`);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      'plain-text',
    );
  };


  const renderCard = ({ item, index }: { item: GridItem; index: number }) => {
    if (item.kind === 'add') {
      return (
        <Pressable style={styles.addTile} onPress={openAddProduct}>
          <View style={[styles.addTileFrame, { height: IMAGE_SIZE }]}>
            <View style={styles.addTilePlus}>
              <Ionicons name="add" size={28} color={colors.brand.primaryDark} />
            </View>
            <Text style={styles.addTileText}>เพิ่มสินค้า</Text>
          </View>
          <View style={styles.addTileInfoSpacer} />
        </Pressable>
      );
    }

    const product = item.product;
    const stock = stockOf(product);
    const tone = stockTone(stock);
    const itemVariants = variants.filter((v) => v.masterSkuId === product.id);
    const prices = itemVariants.map((v) => v.price);
    const minPrice = prices.length ? Math.min(...prices) : product.basePrice;
    const maxPrice = prices.length ? Math.max(...prices) : product.basePrice;
    const priceLabel =
      minPrice === maxPrice ? formatTHB(minPrice) : `${formatTHB(minPrice)} - ${formatTHB(maxPrice)}`;
    const activity = activityBySku.get(product.id);
    const imageUri = product.imageUri ?? masterContentImage(product.id);
    const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          if (activity && activity.total > 0) openAlerts(product, activity);
          else {
            void Haptics.selectionAsync();
            Alert.alert(
              product.title,
              [
                product.masterSku,
                `${itemVariants.length} ตัวเลือก (SKU)`,
                `คลังเหลือ ${stock} ชิ้น`,
                priceLabel,
                product.description ? `\n${product.description}` : null,
              ]
                .filter(Boolean)
                .join('\n'),
            );
          }
        }}
      >
        <View style={styles.visual}>
          <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
          <Image source={{ uri: imageUri }} style={styles.visualImage} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(7,20,15,0.12)', 'rgba(7,20,15,0.5)']}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.hashTag}>
            <Text style={styles.hashTagText}>{hashTag(product)}</Text>
          </View>

          <View style={[styles.statusDot, { backgroundColor: STOCK_DOT[tone] }]} />

          {activity && activity.total > 0 ? (
            <Pressable
              style={styles.alertBadge}
              onPress={() => openAlerts(product, activity)}
              hitSlop={6}
            >
              <Ionicons name="notifications" size={10} color="#fff" />
              <Text style={styles.alertBadgeText}>{activity.total}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.infoPanel}>
          <Text style={styles.productName} numberOfLines={2}>
            {product.title}
          </Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            {itemVariants.length} ตัวเลือก (SKU) · คลังเหลือ {stock} ชิ้น
          </Text>
          <Text style={styles.price} numberOfLines={1}>
            {priceLabel}
          </Text>
        </View>
      </Pressable>
    );
  };

  const listHeader = (
    <View style={styles.headerBlock}>
      <View style={styles.actionsRow}>
        <Pressable style={styles.outlineBtn} onPress={shareStore}>
          <Ionicons name="share-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>แชร์หน้าร้าน</Text>
        </Pressable>
        <Pressable
          style={styles.outlineBtn}
          onPress={() => Alert.alert('นำเข้า', 'รองรับนำเข้า CSV / Excel ในรอบถัดไป')}
        >
          <Ionicons name="cloud-upload-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>นำเข้า</Text>
        </Pressable>
        <Pressable style={styles.addBtn} onPress={() => router.push('/create-details')}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>เพิ่มสินค้า</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        {chips.map((c) => {
          const active = category === c.key;
          const stock = stockByCategory.get(c.key) ?? 0;
          return (
            <Pressable
              key={c.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => {
                void Haptics.selectionAsync();
                setCategory(c.key);
              }}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
              >
                {c.label} {stock.toLocaleString('th-TH')}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={[styles.chip, styles.chipAdd]} onPress={addUserCategory}>
          <Ionicons name="add" size={13} color={colors.brand.primaryDark} />
          <Text style={styles.chipAddText} numberOfLines={1}>
            เพิ่มหมวดหมู่
          </Text>
        </Pressable>
      </ScrollView>

      <View style={styles.toolsRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาสินค้า, SPU หรือหมวดหมู่"
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
        </View>
        <Pressable
          style={[styles.toolBtn, toneFilter !== 'all' && styles.toolBtnActive]}
          onPress={openToneFilter}
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={toneFilter !== 'all' ? '#fff' : colors.text.primary}
          />
        </Pressable>
        <Pressable
          style={styles.sortBtn}
          onPress={() => {
            void Haptics.selectionAsync();
            setSortLatest((v) => !v);
          }}
        >
          <Text style={styles.sortBtnText}>{sortLatest ? 'อัปเดตล่าสุด' : 'เก่าสุดก่อน'}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.text.secondary} />
        </Pressable>
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.spuCount}>
          {products.length.toLocaleString('th-TH')} SPU
          {toneFilter !== 'all' ? ` · ${TONE_LABEL[toneFilter]}` : ''}
        </Text>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: STOCK_DOT.ready }]} />
          <Text style={styles.legendText}>พร้อมขาย</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: STOCK_DOT.low }]} />
          <Text style={styles.legendText}>สต็อกต่ำ</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: STOCK_DOT.out }]} />
          <Text style={styles.legendText}>หมดสต็อก</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.topBar}>
        <Pressable
          hitSlop={10}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/profile');
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={styles.topTitles}>
          <Text style={styles.title}>คลังสินค้าของฉัน</Text>
          <Text style={styles.subtitle}>
            จัดการสินค้า {masters.length.toLocaleString('th-TH')} รายการแบบ Visual Feed
          </Text>
        </View>
      </View>

      <FlatList
        data={gridItems}
        keyExtractor={(item) => item.id}
        numColumns={COLS}
        style={styles.list}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        renderItem={renderCard}
        ListFooterComponent={
          <Text style={styles.footerHint}>เลื่อนฟีดเพื่อโหลดสินค้าแบบ Virtual Scroll</Text>
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
    paddingHorizontal: H_PAD,
    paddingBottom: 8,
    gap: 4,
    backgroundColor: '#F3F5F4',
    zIndex: 2,
  },
  backBtn: { marginRight: 2 },
  topTitles: { flex: 1 },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  list: {
    flex: 1,
    backgroundColor: '#F3F5F4',
  },
  headerBlock: {
    backgroundColor: '#F3F5F4',
    paddingBottom: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: H_PAD,
    marginBottom: 12,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border.strong,
    backgroundColor: colors.surface.card,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  outlineBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.primary,
  },
  addBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent.live,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 12,
  },
  chipsScroll: {
    marginBottom: 12,
    flexGrow: 0,
  },
  chips: {
    paddingHorizontal: H_PAD,
    gap: 8,
    alignItems: 'center',
    paddingVertical: 2,
  },
  chip: {
    backgroundColor: colors.surface.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border.soft,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#2A2F2C',
    borderColor: '#2A2F2C',
  },
  chipText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.text.secondary,
    includeFontPadding: false,
  },
  chipTextActive: { color: '#fff' },
  chipAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderStyle: 'dashed',
    borderColor: colors.brand.primaryDark,
    backgroundColor: colors.brand.mist,
  },
  chipAddText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    color: colors.brand.primaryDark,
    includeFontPadding: false,
  },
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: H_PAD,
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    paddingVertical: 0,
  },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: {
    backgroundColor: '#2A2F2C',
    borderColor: '#2A2F2C',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  sortBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: H_PAD,
    marginBottom: 12,
  },
  spuCount: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.primary,
    marginRight: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.text.secondary, fontWeight: '600' },
  grid: {
    paddingHorizontal: H_PAD,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  addTile: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.surface.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border.strong,
  },
  addTileFrame: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.brand.mist,
  },
  addTilePlus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.brand.primaryDark,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTileText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.brand.primaryDark,
  },
  addTileInfoSpacer: {
    height: INFO_H,
    backgroundColor: colors.surface.card,
  },
  visual: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0B1F17',
  },
  visualImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    opacity: 0.88,
  },
  hashTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(10,16,14,0.72)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  hashTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  statusDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  alertBadge: {
    position: 'absolute',
    top: 28,
    right: 6,
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.accent.live,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  alertBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  infoPanel: {
    height: INFO_H,
    backgroundColor: colors.surface.card,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 3,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
    lineHeight: 17,
    height: 34,
  },
  metaLine: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '600',
  },
  price: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '900',
    color: colors.accent.live,
  },
  footerHint: {
    textAlign: 'center',
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 8,
    marginBottom: 12,
  },
});
