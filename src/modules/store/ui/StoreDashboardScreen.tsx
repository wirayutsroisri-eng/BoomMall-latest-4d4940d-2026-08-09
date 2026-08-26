import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
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
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import {
  buildClonePrefill,
  stockStatusOf,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '@/modules/commerce/domain/stock-core';
import type { MasterSku, SkuVariant, StockStatus } from '@/modules/commerce/domain/types';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { ORDER_STATUS_LABEL } from '@/modules/store/domain/types';
import { parseInventoryCsv } from '@/modules/store/domain/inventory-csv';
import { coverKindOf, listingThumbUri } from '@/modules/commerce/domain/product-media';
import { useCategoriesStore } from '@/modules/store/state/categories-store';
import { useStockAlertsStore } from '@/modules/store/state/stock-alerts-store';
import { useWarehouseStore } from '@/modules/warehouse/state/warehouse-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import type { Listing } from '@/modules/warehouse/domain/types';
import { ProductQuickPreviewSheet } from '@/modules/store/ui/warehouse/ProductQuickPreviewSheet';
import { PromoteProductSheet } from '@/modules/store/ui/PromoteProductSheet';
import { SellerNotifyBanner } from '@/modules/store/ui/SellerNotifyBanner';
import {
  InventoryProductCard,
  INVENTORY_CARD_H,
} from '@/modules/store/ui/warehouse/InventoryProductCard';
import { BarcodeScannerSheet } from '@/modules/store/ui/BarcodeScannerSheet';
import { CategoryNameSheet } from '@/modules/store/ui/CategoryNameSheet';
import { colors } from '@/shared/theme/colors';

const H_PAD = 14;
const ITEM_GAP = 10;
const ITEM_H = INVENTORY_CARD_H + ITEM_GAP;
type ToneFilter = 'all' | StockStatus;

function optionLinesOf(variants: SkuVariant[]): string[] {
  if (!variants.length) return ['ยังไม่มีรุ่น'];
  return variants.map((v) => {
    const name = v.label.trim() && v.label.trim() !== 'มาตรฐาน' ? v.label.trim() : '';
    const size = v.attrs.size?.trim();
    const weight = v.attrs.weight?.trim();
    const parts = [name, size, weight].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    if (v.label.trim() === 'มาตรฐาน') return 'รุ่นมาตรฐาน';
    return v.label.trim() || v.sku;
  });
}

const CATEGORY_MATCH_ORDER: Array<[string, string[]]> = [
  ['controller', ['controller', 'กล่องควบคุม']],
  ['motor', ['conversion', 'motor', 'hub', 'มอเตอร์']],
  ['brakes', ['brake', 'เบรก', 'ชุดเบรก']],
  ['cables', ['cable', 'wire', 'สายไฟ', 'สายชาร์จ']],
  ['custom', ['custom', 'สั่งทำ']],
  ['bag', ['bag', 'กระเป๋า']],
  ['apparel', ['shirt', 'jacket', 'เสื้อ']],
  ['battery', ['lifepo4', 'bms', 'pack', 'cell', 'starter', 'fleet', 'แบต']],
  ['parts', ['shock', 'rim', 'disc', 'led', 'footpeg', 'cooling', 'display', 'charger', 'cnc']],
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

type GridItem = {
  id: string;
  product: MasterSku;
  listing?: Listing;
};

export function StoreDashboardScreen() {
  const insets = useSafeAreaInsets();
  const myShopId = useAuthStore((s) => s.user?.shopId ?? '');
  const [tab, setTab] = useState<'mine' | 'shared'>('mine');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [sortLatest, setSortLatest] = useState(true);
  const [toneFilter, setToneFilter] = useState<ToneFilter>('all');
  const [previewProductId, setPreviewProductId] = useState<string | null>(null);
  const [promoteProductId, setPromoteProductId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [categoryName, setCategoryName] = useState<
    { mode: 'create' } | { mode: 'rename'; key: string; label: string } | null
  >(null);

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
  const onNewProductCreated = useWarehouseStore((s) => s.onNewProductCreated);
  const takeTransitions = useStockAlertsStore((s) => s.takeTransitions);
  const createMasterWithVariants = useInventoryStore((s) => s.createMasterWithVariants);

  const pendingRequests = requests.filter(
    (r) => r.status === 'pending' && warehousesShared.some((w) => w.id === r.warehouseId && w.ownerShopId === myShopId),
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
    () => masters.filter((m) => m.ownerShopId === myShopId),
    [masters, myShopId],
  );

  const myListings = useMemo(
    () => listings.filter((l) => l.shopId === myShopId),
    [listings, myShopId],
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
    if (m.barcode?.toLowerCase().includes(q)) return true;
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
    return list.map((product) => ({ id: product.id, product }));
  }, [tab, myMasters, myListings, mastersById, category, query, sortLatest, toneFilter, stockOfMaster, categories]);

  // ----- Actions -----
  const openAddProduct = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const label = categories.find((c) => c.key === category)?.label ?? 'ทั้งหมด';
    router.push({
      pathname: '/create-details',
      params: {
        mode: 'sell',
        category,
        categoryLabel: category === 'all' ? '' : label,
      },
    });
  };

  const cloneProduct = useCallback(
    (master: MasterSku) => {
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
    },
    [variantsByMaster, categories],
  );

  const duplicateProduct = useCallback(
    (productId: string) => {
      const master = mastersById.get(productId);
      if (!master) return;
      cloneProduct(master);
    },
    [mastersById, cloneProduct],
  );

  const openAlerts = (master: MasterSku, activity: ProductActivity) => {
    Alert.alert(
      master.title,
      [...activity.buyLines, ...activity.askLines].join('\n\n') ||
        'ยังไม่มีการแจ้งเตือนสำหรับสินค้านี้',
      [{ text: 'รับทราบ', onPress: () => markProductAlertsSeen(master.id) }],
    );
  };

  const openProduct = useCallback((productId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreviewProductId(null);
    router.push({ pathname: '/store/product/[id]', params: { id: productId } });
  }, []);

  const openEdit = useCallback((productId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreviewProductId(null);
    router.push({ pathname: '/products/[id]/edit', params: { id: productId } });
  }, []);

  const openPreview = useCallback((productId: string) => {
    void Haptics.selectionAsync();
    setPreviewProductId(productId);
  }, []);

  const openProductAlerts = useCallback(
    (productId: string) => {
      const master = mastersById.get(productId);
      const activity = activityBySku.get(productId);
      if (!master || !activity) return;
      openAlerts(master, activity);
    },
    [mastersById, activityBySku],
  );

  const applyBarcodeLookup = (code: string) => {
    setScannerOpen(false);
    const q = code.trim().toLowerCase();
    const pool = tab === 'mine' ? myMasters : myListings
      .map((l) => mastersById.get(l.masterSkuId))
      .filter((m): m is MasterSku => !!m);
    const exact = pool.filter(
      (m) =>
        (m.barcode ?? '').toLowerCase() === q ||
        m.masterSku.toLowerCase() === q ||
        (variantsByMaster.get(m.id) ?? []).some((v) => v.sku.toLowerCase() === q),
    );
    const hits = exact.length ? exact : pool.filter((m) => matchQuery(m, q));
    setQuery(code.trim());
    if (hits.length === 1) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPreviewProductId(hits[0]!.id);
      return;
    }
    if (hits.length > 1) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    Alert.alert('ไม่พบสินค้า', `ไม่พบบาร์โค้ดหรือ SKU “${code.trim()}” ในคลังนี้`);
  };

  const importCsvFile = async () => {
    if (importing) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'text/plain',
          'public.comma-separated-values-text',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      setImporting(true);
      const file = new File(picked.assets[0].uri);
      const text = await file.text();
      const parsed = parseInventoryCsv(text);
      if (!parsed.ok) {
        Alert.alert('นำเข้าไม่สำเร็จ', parsed.reason);
        return;
      }
      const confirm = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'นำเข้าสินค้า',
          `พบ ${parsed.products.length} สินค้า` +
            (parsed.skipped ? ` (ข้าม ${parsed.skipped} แถว)` : '') +
            '\nยืนยันสร้างในคลังนี้?',
          [
            { text: 'ยกเลิก', style: 'cancel', onPress: () => resolve(false) },
            { text: 'นำเข้า', onPress: () => resolve(true) },
          ],
        );
      });
      if (!confirm) return;
      const stamp = `${Date.now()}`.slice(-6);
      parsed.products.forEach((product, index) => {
        const cat =
          categories.find(
            (c) =>
              c.key === product.category ||
              c.label.toLowerCase() === (product.category ?? '').trim().toLowerCase(),
          ) ?? null;
        const sku = product.sku?.trim() || `BEV-IMP-${stamp}-${index + 1}`;
        const basePrice = Math.min(...product.variants.map((v) => v.price));
        const masterId = createMasterWithVariants({
          title: product.title,
          masterSku: sku,
          channel: 'B2C',
          basePrice,
          tags: [cat?.label ?? 'Custom', 'Import'],
          customFields: [],
          ownerShopId: myShopId,
          description: product.description,
          categoryKey: cat?.key,
          variants: product.variants.map((v, vi) => ({
            label: v.label,
            sku: v.sku?.trim() || `${sku}-V${vi + 1}`,
            price: v.price,
            attrs: {},
            warehouseId: 'PRIMARY',
            onHand: v.stock,
          })),
        });
        const ownedWarehouse = warehousesShared.find((row) => row.ownerShopId === myShopId);
        if (ownedWarehouse) onNewProductCreated(ownedWarehouse.id, masterId, cat?.key);
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('นำเข้าเรียบร้อย', `สร้างสินค้าใหม่ ${parsed.products.length} รายการจากไฟล์`);
    } catch {
      Alert.alert('นำเข้าไม่สำเร็จ', 'อ่านไฟล์ไม่ได้ — บันทึกเป็น CSV แล้วลองอีกครั้ง');
    } finally {
      setImporting(false);
    }
  };

  const previewProduct = previewProductId ? mastersById.get(previewProductId) ?? null : null;
  const previewListing = useMemo(
    () =>
      previewProductId
        ? myListings.find((l) => l.masterSkuId === previewProductId)
        : undefined,
    [previewProductId, myListings],
  );
  const sheetVariants = (masterId?: string | null) =>
    masterId ? variantsByMaster.get(masterId) ?? [] : [];

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
    setCategoryName({ mode: 'create' });
  };

  const openCategoryMenu = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat || key === 'all') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }> = [];
    if (!cat.builtin) {
      buttons.push({
        text: 'เปลี่ยนชื่อ',
        onPress: () => setCategoryName({ mode: 'rename', key, label: cat.label }),
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
  const renderCard = useCallback(
    ({ item }: { item: GridItem }) => {
      const { product, listing } = item;
      const stock = stockOfMaster(product);
      const itemVariants = variantsByMaster.get(product.id) ?? [];
      const threshold = Math.min(
        ...itemVariants.map((v) => v.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD),
        DEFAULT_LOW_STOCK_THRESHOLD,
      );
      const tone = stockStatusOf(stock, threshold);
      const prices = itemVariants.map((v) => v.price);
      const minPrice = prices.length ? Math.min(...prices) : product.basePrice;
      const maxPrice = prices.length ? Math.max(...prices) : product.basePrice;
      const priceLabel =
        minPrice === maxPrice ? formatTHB(minPrice) : `${formatTHB(minPrice)} – ${formatTHB(maxPrice)}`;
      const activity = activityBySku.get(product.id);
      const sourceWarehouse = listing
        ? warehousesShared.find((w) => w.id === listing.warehouseId)?.name
        : undefined;

      return (
        <View style={{ marginBottom: ITEM_GAP }}>
          <InventoryProductCard
            productId={product.id}
            imageUri={listingThumbUri(product) ?? masterContentImage(product.id)}
            coverKind={coverKindOf(product)}
            title={product.title}
            priceLabel={priceLabel}
            optionLines={optionLinesOf(itemVariants)}
            stock={stock}
            tone={tone}
            disabled={listing?.status === 'disabled'}
            sourceWarehouse={sourceWarehouse}
            activityCount={activity?.total}
            canEdit={tab === 'mine' && !listing}
            promoted={Boolean(product.isPromoted)}
            onOpen={tab === 'mine' && !listing ? openEdit : openProduct}
            onPreview={openPreview}
            onAlertPress={activity && activity.total > 0 ? openProductAlerts : undefined}
          />
        </View>
      );
    },
    [
      stockOfMaster,
      variantsByMaster,
      activityBySku,
      warehousesShared,
      tab,
      openProduct,
      openEdit,
      openPreview,
      openProductAlerts,
    ],
  );

  const listHeader = (
    <View style={styles.headerBlock}>
      {/* Back-office stats */}
      <View style={styles.statsRow}>
        <StatCell label="สินค้า" value={stats.products} />
        <StatCell label="SKU" value={stats.skuCount} />
        <StatCell label="ใกล้หมด" value={stats.low} accent={stats.low > 0 ? STOCK_DOT.low : undefined} />
        <StatCell label="หมด" value={stats.out} accent={stats.out > 0 ? STOCK_DOT.out : undefined} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12, flexGrow: 0 }}
        contentContainerStyle={styles.actionsRow}
      >
        <Pressable style={styles.outlineBtn} onPress={() => setScannerOpen(true)}>
          <Ionicons name="barcode-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>สแกนบาร์โค้ด</Text>
        </Pressable>
        <Pressable
          style={[styles.outlineBtn, importing && { opacity: 0.6 }]}
          onPress={() => void importCsvFile()}
          disabled={importing}
        >
          <Ionicons name="document-text-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>{importing ? 'กำลังนำเข้า…' : 'นำเข้า CSV'}</Text>
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
        <Pressable style={styles.outlineBtn} onPress={shareStore}>
          <Ionicons name="share-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>แชร์หน้าร้าน</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={() => router.push('/store/ledger')}>
          <Ionicons name="receipt-outline" size={14} color={colors.text.primary} />
          <Text style={styles.outlineBtnText}>ความเคลื่อนไหว</Text>
        </Pressable>
        <Pressable style={styles.addBtn} onPress={openAddProduct}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>เพิ่มสินค้า</Text>
        </Pressable>
      </ScrollView>

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
        data={productItems}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        renderItem={renderCard}
        getItemLayout={(_, index) => ({
          length: ITEM_H,
          offset: ITEM_H * index,
          index,
        })}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={
          tab === 'mine' ? (
            <Pressable style={styles.addRow} onPress={openAddProduct}>
              <Ionicons name="add" size={18} color={colors.brand.primaryDark} />
              <Text style={styles.addRowText}>เพิ่มสินค้า</Text>
            </Pressable>
          ) : (
            <Text style={styles.footerHint}>แสดงครบทุกรายการแล้ว</Text>
          )
        }
      />

      <ProductQuickPreviewSheet
        visible={!!previewProduct}
        product={previewProduct}
        variants={sheetVariants(previewProduct?.id)}
        availableTotal={previewProduct ? stockOfMaster(previewProduct) : 0}
        sellStatusLabel={
          previewListing?.status === 'disabled'
            ? '🔴 ปิดการขาย'
            : undefined
        }
        sourceWarehouse={
          previewListing
            ? warehousesShared.find((w) => w.id === previewListing.warehouseId)?.name
            : undefined
        }
        onClose={() => setPreviewProductId(null)}
        canEdit={!previewListing}
        onPromote={
          previewProduct && !previewListing
            ? () => {
                const id = previewProduct.id;
                setPreviewProductId(null);
                setPromoteProductId(id);
              }
            : undefined
        }
        onOpenFull={() => {
          if (!previewProduct) return;
          const id = previewProduct.id;
          const goEdit = !previewListing;
          setPreviewProductId(null);
          if (goEdit) {
            router.push({ pathname: '/products/[id]/edit', params: { id } });
          } else {
            router.push({ pathname: '/store/product/[id]', params: { id } });
          }
        }}
        onClone={
          previewProduct && !previewListing
            ? () => {
                const master = previewProduct;
                setPreviewProductId(null);
                cloneProduct(master);
              }
            : undefined
        }
      />

      <PromoteProductSheet
        visible={!!promoteProductId}
        product={promoteProductId ? mastersById.get(promoteProductId) ?? null : null}
        onClose={() => setPromoteProductId(null)}
      />

      <BarcodeScannerSheet
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={applyBarcodeLookup}
        mode="lookup"
        title="ค้นหาด้วยบาร์โค้ด"
        subtitle="สแกนหรือพิมพ์บาร์โค้ด / SKU เพื่อเปิดสินค้าทันที"
      />
      <CategoryNameSheet
        visible={!!categoryName}
        title={categoryName?.mode === 'rename' ? 'เปลี่ยนชื่อหมวดหมู่' : 'สร้างหมวดใหม่'}
        subtitle="ตั้งชื่อหมวดหมู่ — ระบบจะรวมยอดสต็อกของสินค้าที่เข้าเงื่อนไขให้อัตโนมัติ"
        initialValue={categoryName?.mode === 'rename' ? categoryName.label : ''}
        onClose={() => setCategoryName(null)}
        onSubmit={(text) => {
          if (categoryName?.mode === 'rename') {
            renameCategory(categoryName.key, text);
            setCategoryName(null);
            return;
          }
          const result = addCategory(text);
          if (!result.ok) {
            Alert.alert('สร้างไม่สำเร็จ', result.message);
            return;
          }
          setCategory(result.key!);
          setCategoryName(null);
        }}
      />
      <SellerNotifyBanner />
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
    paddingRight: H_PAD,
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
    flexShrink: 0,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent.live,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
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
  listContent: {
    paddingHorizontal: H_PAD,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brand.primaryDark,
    backgroundColor: colors.brand.mist,
    marginTop: 4,
    marginBottom: 12,
  },
  addRowText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.brand.primaryDark,
  },
  footerHint: {
    textAlign: 'center',
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 8,
    marginBottom: 12,
  },
});
