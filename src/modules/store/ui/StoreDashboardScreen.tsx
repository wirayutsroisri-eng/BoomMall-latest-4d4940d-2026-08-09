import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  buildClonePrefill,
  stockStatusOf,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '@/modules/commerce/domain/stock-core';
import type { MasterSku, StockStatus } from '@/modules/commerce/domain/types';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { ORDER_STATUS_LABEL } from '@/modules/store/domain/types';
import { useCategoriesStore } from '@/modules/store/state/categories-store';
import { useStockAlertsStore } from '@/modules/store/state/stock-alerts-store';
import { useWarehouseStore, MY_SHOP_ID } from '@/modules/warehouse/state/warehouse-store';
import type { Listing } from '@/modules/warehouse/domain/types';
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
const PAGE_SIZE = 30;

type ToneFilter = 'all' | StockStatus;

const CATEGORY_MATCH_ORDER: Array<[string, string[]]> = [
  ['controller', ['controller']],
  ['motor', ['conversion', 'motor', 'hub']],
  ['custom', ['custom', 'สั่งทำ']],
  ['bag', ['bag', 'กระเป๋า']],
  ['apparel', ['shirt', 'jacket', 'เสื้อ']],
  ['battery', ['lifepo4', 'bms', 'pack', 'cell', 'starter', 'fleet', 'แบต']],
  ['parts', ['brake', 'shock', 'rim', 'disc', 'cable', 'led', 'footpeg', 'cooling', 'display', 'charger', 'cnc']],
];

const TONE_LABEL: Record<ToneFilter, string> = {
  all: 'ทุกสถานะ',
  ready: 'พร้อมขาย',
  low: 'สต็อกต่ำ',
  out: 'หมดสต็อก',
};

const STOCK_DOT: Record<StockStatus, string> = {
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

function inferCategory(master: MasterSku): string {
  if (master.categoryKey && !master.categoryKey.startsWith('user:')) return master.categoryKey;
  const hay = `${master.title} ${master.tags.join(' ')}`.toLowerCase();
  for (const [key, needles] of CATEGORY_MATCH_ORDER) {
    if (needles.some((n) => hay.includes(n))) return key;
  }
  return 'parts';
}

function matchesUserCategory(master: MasterSku, key: string, label: string) {
  if (master.categoryKey === key) return true;
  const hay = `${master.title} ${master.tags.join(' ')}`.toLowerCase();
  return hay.includes(label.toLowerCase());
}

type ProductActivity = {
  buyCount: number;
  askCount: number;
  total: number;
  buyLines: string[];
  askLines: string[];
};

const ADD_TILE_ID = '__add_product__';
type GridItem =
  | { kind: 'product'; id: string; product: MasterSku; listing?: Listing }
  | { kind: 'add'; id: typeof ADD_TILE_ID };

export function StoreDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [sortLatest, setSortLatest] = useState(true);
  const [toneFilter, setToneFilter] = useState<ToneFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pageKey, setPageKey] = useState('');

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const stockByKey = useInventoryStore((s) => s.stockByKey);
  const incomingOrders = useOrdersStore((s) => s.incomingOrders);
  const inquiries = useOrdersStore((s) => s.inquiries);
  const markProductAlertsSeen = useOrdersStore((s) => s.markProductAlertsSeen);

  const categories = useCategoriesStore((s) => s.categories);
  const addCategory = useCategoriesStore((s) => s.addCategory);
  const renameCategory = useCategoriesStore((s) => s.renameCategory);
  const toggleHidden = useCategoriesStore((s) => s.toggleHidden);
  const moveCategory = useCategoriesStore((s) => s.moveCategory);
  const removeCategory = useCategoriesStore((s) => s.removeCategory);

  const listings = useWarehouseStore((s) => s.listings);
  const warehousesShared = useWarehouseStore((s) => s.warehouses);
  const requests = useWarehouseStore((s) => s.requests);
  const takeTransitions = useStockAlertsStore((s) => s.takeTransitions);

  const pendingRequests = requests.filter(
    (r) => r.status === 'pending' && warehousesShared.some((w) => w.id === r.warehouseId && w.ownerShopId === MY_SHOP_ID),
  ).length;

  // ----- Derived stock maps (reactive to stockByKey) -----
  const availableByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of Object.values(stockByKey)) {
      map.set(row.variantId, (map.get(row.variantId) ?? 0) + Math.max(0, row.onHand - row.reserved));
    }
    return map;
  }, [stockByKey]);

  const reservedByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of Object.values(stockByKey)) {
      map.set(row.variantId, (map.get(row.variantId) ?? 0) + row.reserved);
    }
    return map;
  }, [stockByKey]);

  const variantsByMaster = useMemo(() => {
    const map = new Map<string, typeof variants>();
    for (const v of variants) {
      const list = map.get(v.masterSkuId);
      if (list) list.push(v);
      else map.set(v.masterSkuId, [v]);
    }
    return map;
  }, [variants]);

  const mastersById = useMemo(() => new Map(masters.map((m) => [m.id, m])), [masters]);

  const myMasters = useMemo(
    () => masters.filter((m) => !m.ownerShopId || m.ownerShopId === MY_SHOP_ID),
    [masters],
  );

  const myListings = useMemo(
    () => listings.filter((l) => l.shopId === MY_SHOP_ID),
    [listings],
  );

  const stockOfMaster = useMemo(() => {
    return (m: MasterSku) =>
      (variantsByMaster.get(m.id) ?? []).reduce(
        (sum, v) => sum + (availableByVariant.get(v.id) ?? 0),
        0,
      );
  }, [variantsByMaster, availableByVariant]);

  // ----- Back-office stats: สินค้า / SKU / ใกล้หมด / หมด -----
  const stats = useMemo(() => {
    let skuCount = 0;
    let low = 0;
    let out = 0;
    const statusByVariant: Record<string, StockStatus> = {};
    for (const m of myMasters) {
      for (const v of variantsByMaster.get(m.id) ?? []) {
        skuCount += 1;
        const status = stockStatusOf(
          availableByVariant.get(v.id) ?? 0,
          v.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
        );
        statusByVariant[v.id] = status;
        if (status === 'low') low += 1;
        if (status === 'out') out += 1;
      }
    }
    return { products: myMasters.length, skuCount, low, out, statusByVariant };
  }, [myMasters, variantsByMaster, availableByVariant]);

  // ----- Low stock notifications (transition-based, no spam) -----
  const alertedOnce = useRef(false);
  useEffect(() => {
    const fresh = takeTransitions(stats.statusByVariant);
    if (fresh.length && !alertedOnce.current) {
      alertedOnce.current = true;
      const lines = fresh.slice(0, 6).map((variantId) => {
        const v = variants.find((x) => x.id === variantId);
        const m = v ? mastersById.get(v.masterSkuId) : undefined;
        const available = availableByVariant.get(variantId) ?? 0;
        return `• ${m?.title ?? ''} (${v?.sku ?? variantId}) เหลือ ${available}`;
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'ควรเติมสินค้า',
        [`SKU ที่เพิ่งเข้าเกณฑ์ใกล้หมด/หมด ${fresh.length} รายการ:`, ...lines].join('\n'),
      );
    }
  }, [stats.statusByVariant]);

  // ----- Activity (orders + inquiries) -----
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

  // ----- Categories -----
  const visibleCategories = categories.filter((c) => !c.hidden);

  const inCategory = (m: MasterSku, cat: string) => {
    if (cat === 'all') return true;
    if (cat.startsWith('user:')) {
      const label = categories.find((c) => c.key === cat)?.label ?? cat.slice(5);
      return matchesUserCategory(m, cat, label);
    }
    return inferCategory(m) === cat;
  };

  const stockByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    const pool = tab === 'mine' ? myMasters : myListings
      .map((l) => mastersById.get(l.masterSkuId))
      .filter((m): m is MasterSku => !!m);
    for (const m of pool) {
      const stock = stockOfMaster(m);
      total += stock;
      for (const c of categories) {
        if (c.key !== 'all' && inCategory(m, c.key)) {
          counts.set(c.key, (counts.get(c.key) ?? 0) + stock);
        }
      }
    }
    counts.set('all', total);
    return counts;
  }, [tab, myMasters, myListings, mastersById, stockOfMaster, categories]);

  // ----- Search / filter / sort (name, SKU, category, variant) -----
  const matchQuery = (m: MasterSku, q: string) => {
    if (m.title.toLowerCase().includes(q) || m.masterSku.toLowerCase().includes(q)) return true;
    if (m.tags.some((t) => t.toLowerCase().includes(q))) return true;
    const catKey = inferCategory(m);
    const catLabel = categories.find((c) => c.key === catKey)?.label ?? '';
    if (catLabel.toLowerCase().includes(q)) return true;
    return (variantsByMaster.get(m.id) ?? []).some(
      (v) => v.sku.toLowerCase().includes(q) || v.label.toLowerCase().includes(q),
    );
  };

  const productItems = useMemo<GridItem[]>(() => {
    const q = query.trim().toLowerCase();

    if (tab === 'shared') {
      let rows = myListings
        .map((l) => ({ listing: l, master: mastersById.get(l.masterSkuId) }))
        .filter((r): r is { listing: Listing; master: MasterSku } => !!r.master);
      rows = rows.filter(({ master }) => {
        if (!inCategory(master, category)) return false;
        if (toneFilter !== 'all' && stockStatusOf(stockOfMaster(master)) !== toneFilter) return false;
        return !q || matchQuery(master, q);
      });
      if (!sortLatest) rows = [...rows].reverse();
      else rows = [...rows].sort((a, b) => b.listing.installedAt.localeCompare(a.listing.installedAt));
      return rows.map(({ listing, master }) => ({
        kind: 'product' as const,
        id: listing.id,
        product: master,
        listing,
      }));
    }

    let list = myMasters.filter((m) => {
      if (!inCategory(m, category)) return false;
      if (toneFilter !== 'all' && stockStatusOf(stockOfMaster(m)) !== toneFilter) return false;
      return !q || matchQuery(m, q);
    });
    // masters are prepended on create, so natural order is already newest-first
    if (!sortLatest) list = [...list].reverse();
    return list.map((product) => ({ kind: 'product' as const, id: product.id, product }));
  }, [tab, myMasters, myListings, mastersById, category, query, sortLatest, toneFilter, stockOfMaster, categories]);

  // Reset pagination when filters change (derived-state-during-render pattern)
  const filterKey = `${tab}|${category}|${query}|${toneFilter}|${sortLatest}`;
  if (pageKey !== filterKey) {
    setPageKey(filterKey);
    setVisibleCount(PAGE_SIZE);
  }

  const gridItems = useMemo<GridItem[]>(() => {
    const page = productItems.slice(0, visibleCount);
    return tab === 'mine' ? [...page, { kind: 'add' as const, id: ADD_TILE_ID }] : page;
  }, [productItems, visibleCount, tab]);

  // ----- Actions -----
  const openAddProduct = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const label = categories.find((c) => c.key === category)?.label ?? 'ทั้งหมด';
    router.push({
      pathname: '/create-details',
      params: { category, categoryLabel: category === 'all' ? '' : label },
    });
  };

  const cloneProduct = (master: MasterSku) => {
    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    const prefill = buildClonePrefill(master, variantsByMaster.get(master.id) ?? [], Date.now());
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const catKey = master.categoryKey ?? inferCategory(master);
    router.push({
      pathname: '/create-details',
      params: {
        clone: JSON.stringify(prefill),
        category: catKey,
        categoryLabel: categories.find((c) => c.key === catKey)?.label ?? '',
      },
    });
  };

  const openAlerts = (master: MasterSku, activity: ProductActivity) => {
    Alert.alert(
      master.title,
      [...activity.buyLines, ...activity.askLines].join('\n\n') ||
        'ยังไม่มีการแจ้งเตือนสำหรับสินค้านี้',
      [{ text: 'รับทราบ', onPress: () => markProductAlertsSeen(master.id) }],
    );
  };

  const openProductMenu = (item: GridItem & { kind: 'product' }) => {
    const { product, listing } = item;
    void Haptics.selectionAsync();
    const activity = activityBySku.get(product.id);
    const isShared = !!listing;

    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }> = [];
    buttons.push({
      text: 'จัดการสต็อก & SKU',
      onPress: () => router.push({ pathname: '/store/product/[id]', params: { id: product.id } }),
    });
    if (!isShared) {
      buttons.push({ text: 'โคลนสินค้า (สร้างเป็นสินค้าใหม่)', onPress: () => cloneProduct(product) });
    }
    if (activity && activity.total > 0) {
      buttons.push({
        text: `การแจ้งเตือน (${activity.total})`,
        onPress: () => openAlerts(product, activity),
      });
    }
    if (isShared && listing) {
      buttons.push({
        text: listing.status === 'active' ? 'ปิดการขายชั่วคราว' : 'เปิดการขาย',
        onPress: () =>
          useWarehouseStore
            .getState()
            .setListingStatus(listing.id, listing.status === 'active' ? 'disabled' : 'active'),
      });
    }
    buttons.push({ text: 'ปิด', style: 'cancel' });

    const sourceWarehouse = listing
      ? warehousesShared.find((w) => w.id === listing.warehouseId)?.name
      : undefined;
    Alert.alert(
      product.title,
      [
        product.masterSku,
        sourceWarehouse ? `ที่มา: ${sourceWarehouse} (Shared Listing — สต็อกกลาง)` : null,
        product.description ? product.description : null,
      ]
        .filter(Boolean)
        .join('\n'),
      buttons,
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
        const result = addCategory(text ?? '');
        if (!result.ok) {
          if (text?.trim()) Alert.alert('สร้างไม่สำเร็จ', result.message);
          return;
        }
        setCategory(result.key!);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      'plain-text',
    );
  };

  const openCategoryMenu = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat || key === 'all') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }> = [];
    if (!cat.builtin) {
      buttons.push({
        text: 'เปลี่ยนชื่อ',
        onPress: () =>
          Alert.prompt('เปลี่ยนชื่อหมวดหมู่', cat.label, (text) => {
            if (text?.trim()) renameCategory(key, text);
          }),
      });
    }
    buttons.push({ text: '← เลื่อนไปซ้าย', onPress: () => moveCategory(key, -1) });
    buttons.push({ text: 'เลื่อนไปขวา →', onPress: () => moveCategory(key, 1) });
    buttons.push({
      text: 'ซ่อนหมวดนี้',
      onPress: () => {
        toggleHidden(key);
        if (category === key) setCategory('all');
      },
    });
    if (!cat.builtin) {
      buttons.push({
        text: 'ลบหมวดหมู่',
        style: 'destructive',
        onPress: () => {
          removeCategory(key);
          if (category === key) setCategory('all');
        },
      });
    }
    buttons.push({ text: 'ปิด', style: 'cancel' });
    Alert.alert(`จัดการ "${cat.label}"`, undefined, buttons);
  };

  const openHiddenCategories = () => {
    const hidden = categories.filter((c) => c.hidden);
    if (!hidden.length) {
      addUserCategory();
      return;
    }
    Alert.alert('หมวดหมู่ที่ซ่อนอยู่', 'แตะเพื่อแสดงอีกครั้ง', [
      ...hidden.map((c) => ({ text: `แสดง "${c.label}"`, onPress: () => toggleHidden(c.key) })),
      { text: 'สร้างหมวดใหม่', onPress: addUserCategory },
      { text: 'ปิด', style: 'cancel' as const },
    ]);
  };

  // ----- Render -----
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

    const { product, listing } = item;
    const stock = stockOfMaster(product);
    const tone = stockStatusOf(stock);
    const itemVariants = variantsByMaster.get(product.id) ?? [];
    const prices = itemVariants.map((v) => v.price);
    const minPrice = prices.length ? Math.min(...prices) : product.basePrice;
    const maxPrice = prices.length ? Math.max(...prices) : product.basePrice;
    const priceLabel =
      minPrice === maxPrice ? formatTHB(minPrice) : `${formatTHB(minPrice)} - ${formatTHB(maxPrice)}`;
    const activity = activityBySku.get(product.id);
    const imageUri = product.imageUri ?? masterContentImage(product.id);
    const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
    const sourceWarehouse = listing
      ? warehousesShared.find((w) => w.id === listing.warehouseId)?.name
      : undefined;
    const disabled = listing?.status === 'disabled';

    return (
      <Pressable style={[styles.card, disabled && { opacity: 0.55 }]} onPress={() => openProductMenu(item)}>
        <View style={styles.visual}>
          <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
          <Image source={{ uri: imageUri }} style={styles.visualImage} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(7,20,15,0.12)', 'rgba(7,20,15,0.5)']}
            style={StyleSheet.absoluteFill}
          />

          {sourceWarehouse ? (
            <View style={[styles.hashTag, styles.sourceTag]}>
              <Ionicons name="business" size={9} color="#fff" />
              <Text style={styles.hashTagText} numberOfLines={1}>
                {sourceWarehouse}
              </Text>
            </View>
          ) : (
            <View style={styles.hashTag}>
              <Text style={styles.hashTagText}>
                #{categories.find((c) => c.key === inferCategory(product))?.label ?? product.channel}
              </Text>
            </View>
          )}

          <View style={[styles.statusDot, { backgroundColor: STOCK_DOT[tone] }]} />

          {tone !== 'ready' ? (
            <View style={[styles.lowBadge, tone === 'out' && { backgroundColor: STOCK_DOT.out }]}>
              <Text style={styles.lowBadgeText}>{tone === 'out' ? 'หมด' : 'ใกล้หมด'}</Text>
            </View>
          ) : null}

          {disabled ? (
            <View style={styles.disabledOverlay}>
              <Text style={styles.disabledText}>ปิดการขาย</Text>
            </View>
          ) : null}

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
            {itemVariants.length} SKU · เหลือ {stock} ชิ้น
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
      {/* Back-office stats */}
      <View style={styles.statsRow}>
        <StatCell label="สินค้า" value={stats.products} />
        <StatCell label="SKU" value={stats.skuCount} />
        <StatCell label="ใกล้หมด" value={stats.low} accent={stats.low > 0 ? STOCK_DOT.low : undefined} />
        <StatCell label="หมด" value={stats.out} accent={stats.out > 0 ? STOCK_DOT.out : undefined} />
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.outlineBtn} onPress={shareStore}>
          <Ionicons name="share-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>แชร์หน้าร้าน</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={() => router.push('/store/ledger')}>
          <Ionicons name="receipt-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>ความเคลื่อนไหว</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={() => router.push('/store/warehouse')}>
          <Ionicons name="business-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>แชร์คลัง</Text>
          {pendingRequests > 0 ? (
            <View style={styles.pendingDot}>
              <Text style={styles.pendingDotText}>{pendingRequests}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.addBtn} onPress={openAddProduct}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>เพิ่มสินค้า</Text>
        </Pressable>
      </View>

      {/* Mine / Shared tabs */}
      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]}
          onPress={() => setTab('mine')}
        >
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>
            สินค้าของฉัน ({myMasters.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === 'shared' && styles.tabBtnActive]}
          onPress={() => setTab('shared')}
        >
          <Text style={[styles.tabText, tab === 'shared' && styles.tabTextActive]}>
            สินค้าจากคลังที่เชื่อม ({myListings.length})
          </Text>
        </Pressable>
      </View>

      {tab === 'shared' && myListings.length === 0 ? (
        <Pressable style={styles.emptyShared} onPress={() => router.push('/store/warehouse')}>
          <Ionicons name="business" size={22} color={colors.brand.primaryDark} />
          <Text style={styles.emptySharedTitle}>ยังไม่มีสินค้าจากคลังที่เชื่อม</Text>
          <Text style={styles.emptySharedHint}>
            แตะเพื่อไปหน้า «แชร์คลังสินค้า» แล้วติดตั้ง Catalog จากคลังที่คุณมีสิทธิ์ —
            สต็อกยังเป็นของคลังต้นทางชุดเดียว (ไม่ Duplicate)
          </Text>
        </Pressable>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        <Pressable
          key="all"
          style={[styles.chip, category === 'all' && styles.chipActive]}
          onPress={() => {
            void Haptics.selectionAsync();
            setCategory('all');
          }}
        >
          <Text style={[styles.chipText, category === 'all' && styles.chipTextActive]} numberOfLines={1}>
            ทั้งหมด {(stockByCategory.get('all') ?? 0).toLocaleString('th-TH')}
          </Text>
        </Pressable>
        {visibleCategories.map((c) => {
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
              onLongPress={() => openCategoryMenu(c.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {c.label} {stock.toLocaleString('th-TH')}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.chip, styles.chipAdd]}
          onPress={addUserCategory}
          onLongPress={openHiddenCategories}
        >
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
            placeholder="ค้นหาชื่อสินค้า, SKU, Variant, หมวดหมู่"
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
          {productItems.length.toLocaleString('th-TH')} SPU
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
            Seller Back Office · สินค้า {stats.products.toLocaleString('th-TH')} · SKU{' '}
            {stats.skuCount.toLocaleString('th-TH')}
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
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (visibleCount < productItems.length) {
            setVisibleCount((n) => n + PAGE_SIZE);
          }
        }}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={
          visibleCount < productItems.length ? (
            <Text style={styles.footerHint}>
              กำลังแสดง {Math.min(visibleCount, productItems.length)}/{productItems.length} · เลื่อนเพื่อโหลดต่อ
            </Text>
          ) : (
            <Text style={styles.footerHint}>แสดงครบทุกรายการแล้ว</Text>
          )
        }
      />
    </View>
  );
}

function StatCell({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>
        {value.toLocaleString('th-TH')}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: H_PAD,
    marginBottom: 12,
  },
  statCell: {
    flex: 1,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  statValue: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.text.muted },
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
  pendingDot: {
    backgroundColor: colors.accent.live,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pendingDotText: { color: '#fff', fontSize: 9, fontWeight: '900' },
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
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: H_PAD,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: '#2A2F2C', borderColor: '#2A2F2C' },
  tabText: { fontSize: 12, fontWeight: '800', color: colors.text.secondary },
  tabTextActive: { color: '#fff' },
  emptyShared: {
    marginHorizontal: H_PAD,
    marginBottom: 12,
    backgroundColor: colors.brand.mist,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brand.primaryDark,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  emptySharedTitle: { fontSize: 13, fontWeight: '900', color: colors.brand.primaryDark },
  emptySharedHint: {
    fontSize: 11,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 16,
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
  sourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(46,140,255,0.85)',
    maxWidth: IMAGE_SIZE - 40,
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
  lowBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: STOCK_DOT.low,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  lowBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  disabledOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,16,14,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
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
