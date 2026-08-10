import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import type { MasterSku } from '@/modules/commerce/domain/types';
import { useWarehouseStore, MY_SHOP_ID } from '@/modules/warehouse/state/warehouse-store';
import { BASE_CATEGORIES } from '@/modules/store/state/categories-store';
import { colors } from '@/shared/theme/colors';

const PAGE_SIZE = 40;

type Mode = 'all' | 'category' | 'manual';

/** Bulk install: [สินค้าทั้งหมด] [เลือกตาม Category] [เลือกสินค้าเอง] — no per-SKU tapping for 1,000+ items */
export function InstallCatalogScreen() {
  const insets = useSafeAreaInsets();
  const { warehouseId } = useLocalSearchParams<{ warehouseId: string }>();

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const warehouses = useWarehouseStore((s) => s.warehouses);
  const listings = useWarehouseStore((s) => s.listings);
  const canI = useWarehouseStore((s) => s.canI);
  const installCatalog = useWarehouseStore((s) => s.installCatalog);

  const warehouse = warehouses.find((w) => w.id === warehouseId);
  const [mode, setMode] = useState<Mode>('all');
  const [pickedCategories, setPickedCategories] = useState<Set<string>>(new Set());
  const [pickedProducts, setPickedProducts] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const catalog = useMemo(
    () => masters.filter((m) => m.ownerShopId === warehouse?.ownerShopId),
    [masters, warehouse],
  );

  const installedIds = useMemo(
    () =>
      new Set(
        listings
          .filter((l) => l.shopId === MY_SHOP_ID && l.warehouseId === warehouseId)
          .map((l) => l.masterSkuId),
      ),
    [listings, warehouseId],
  );

  const skuCountOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of variants) map.set(v.masterSkuId, (map.get(v.masterSkuId) ?? 0) + 1);
    return (m: MasterSku) => map.get(m.id) ?? 0;
  }, [variants]);

  const categoryOf = (m: MasterSku) => m.categoryKey ?? 'parts';
  const categoriesInCatalog = useMemo(() => {
    const present = new Set(catalog.map(categoryOf));
    return BASE_CATEGORIES.filter((c) => present.has(c.key));
  }, [catalog]);

  const selectedIds = useMemo(() => {
    if (mode === 'all') return catalog.map((m) => m.id);
    if (mode === 'category') {
      return catalog.filter((m) => pickedCategories.has(categoryOf(m))).map((m) => m.id);
    }
    return [...pickedProducts];
  }, [mode, catalog, pickedCategories, pickedProducts]);

  const freshCount = selectedIds.filter((id) => !installedIds.has(id)).length;
  const totalSku = useMemo(() => {
    const set = new Set(selectedIds);
    return catalog.filter((m) => set.has(m.id)).reduce((s, m) => s + skuCountOf(m), 0);
  }, [selectedIds, catalog, skuCountOf]);

  if (!warehouse) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, alignItems: 'center' }]}>
        <Text style={styles.title}>ไม่พบคลังสินค้า</Text>
      </View>
    );
  }

  const allowed = canI(warehouse.id, 'CREATE_LISTING');

  const doInstall = () => {
    if (!allowed) {
      Alert.alert('ไม่มีสิทธิ์', 'ต้องได้รับ Permission CREATE_LISTING จากเจ้าของคลัง');
      return;
    }
    if (!selectedIds.length) {
      Alert.alert('ยังไม่ได้เลือกสินค้า', 'เลือกโหมดและสินค้าที่ต้องการติดตั้งก่อน');
      return;
    }
    const result = installCatalog(warehouse.id, selectedIds);
    void Haptics.notificationAsync(
      result.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
    Alert.alert(result.ok ? 'ติดตั้งสำเร็จ' : 'ติดตั้งไม่สำเร็จ', 
      result.ok
        ? `${result.message}\n\nสินค้าเป็น Shared Listing — สต็อกอ้างอิงคลังต้นทางชุดเดียว ไม่มีการ Duplicate Product/SKU/Inventory`
        : result.message,
      [{ text: 'ตกลง', onPress: () => result.ok && router.back() }],
    );
  };

  const toggleCategory = (key: string) => {
    setPickedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleProduct = (id: string) => {
    setPickedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const listData = mode === 'manual' ? catalog.slice(0, visibleCount) : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>ติดตั้งคลังเข้าหน้าร้าน</Text>
          <Text style={styles.subtitle}>
            {warehouse.name} · {catalog.length.toLocaleString('th-TH')} สินค้า · ติดตั้งแล้ว{' '}
            {installedIds.size}
          </Text>
        </View>
      </View>

      {/* Mode selector */}
      <View style={styles.modeRow}>
        {(
          [
            ['all', 'สินค้าทั้งหมด'],
            ['category', 'เลือกตามหมวด'],
            ['manual', 'เลือกสินค้าเอง'],
          ] as Array<[Mode, string]>
        ).map(([m, label]) => (
          <Pressable
            key={m}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            onPress={() => {
              void Haptics.selectionAsync();
              setMode(m);
            }}
          >
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'category' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 10 }}
          contentContainerStyle={styles.catChips}
        >
          {categoriesInCatalog.map((c) => {
            const active = pickedCategories.has(c.key);
            const count = catalog.filter((m) => categoryOf(m) === c.key).length;
            return (
              <Pressable
                key={c.key}
                style={[styles.catChip, active && styles.catChipActive]}
                onPress={() => toggleCategory(c.key)}
              >
                <Ionicons
                  name={active ? 'checkbox' : 'square-outline'}
                  size={14}
                  color={active ? '#fff' : colors.text.muted}
                />
                <Text style={[styles.catChipText, active && { color: '#fff' }]}>
                  {c.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {mode === 'manual' ? (
        <View style={styles.manualBar}>
          <Pressable
            style={styles.selectAllBtn}
            onPress={() => setPickedProducts(new Set(catalog.map((m) => m.id)))}
          >
            <Text style={styles.selectAllText}>เลือกทั้งหมด</Text>
          </Pressable>
          <Pressable style={styles.selectAllBtn} onPress={() => setPickedProducts(new Set())}>
            <Text style={styles.selectAllText}>ล้าง</Text>
          </Pressable>
          <Text style={styles.meta}>เลือกแล้ว {pickedProducts.size}</Text>
        </View>
      ) : null}

      {mode === 'manual' ? (
        <FlatList
          data={listData}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (visibleCount < catalog.length) setVisibleCount((n) => n + PAGE_SIZE);
          }}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => {
            const picked = pickedProducts.has(item.id);
            const installed = installedIds.has(item.id);
            return (
              <Pressable
                style={[styles.productRow, picked && styles.productRowActive]}
                onPress={() => toggleProduct(item.id)}
              >
                <Ionicons
                  name={picked ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={picked ? colors.brand.primaryDark : colors.text.muted}
                />
                <Image
                  source={{ uri: item.imageUri ?? masterContentImage(item.id) }}
                  style={styles.productThumb}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.meta}>
                    {item.masterSku} · {skuCountOf(item)} SKU
                    {installed ? ' · ติดตั้งแล้ว' : ''}
                  </Text>
                </View>
                <Text style={styles.price}>฿{item.basePrice.toLocaleString('th-TH')}</Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120 }}>
          <View style={styles.summaryCard}>
            <Ionicons name="albums-outline" size={26} color={colors.brand.primaryDark} />
            <Text style={styles.summaryBig}>
              {selectedIds.length.toLocaleString('th-TH')} สินค้า ·{' '}
              {totalSku.toLocaleString('th-TH')} SKU
            </Text>
            <Text style={[styles.meta, { textAlign: 'center' }]}>
              {mode === 'all'
                ? 'ติดตั้ง Catalog ทั้งคลังในครั้งเดียว (Bulk) — ระบบข้ามสินค้าที่ติดตั้งแล้วอัตโนมัติ'
                : pickedCategories.size
                  ? `หมวดที่เลือก: ${[...pickedCategories]
                      .map((k) => BASE_CATEGORIES.find((c) => c.key === k)?.label ?? k)
                      .join(', ')}`
                  : 'แตะเลือกหมวดหมู่ด้านบน'}
            </Text>
            {freshCount < selectedIds.length ? (
              <Text style={styles.dupNote}>
                {selectedIds.length - freshCount} รายการติดตั้งไว้แล้ว — จะถูกข้าม (กันซ้ำ)
              </Text>
            ) : null}
          </View>
        </ScrollView>
      )}

      {/* Sticky install bar */}
      <View style={[styles.installBar, { paddingBottom: insets.bottom + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.installCount}>
            จะติดตั้งใหม่ {freshCount.toLocaleString('th-TH')} สินค้า
          </Text>
          <Text style={styles.meta}>Listing Relation เท่านั้น — ไม่ Clone Product</Text>
        </View>
        <Pressable
          style={[styles.installBtn, (!allowed || !freshCount) && { opacity: 0.45 }]}
          onPress={doInstall}
        >
          <Ionicons name="download" size={15} color="#fff" />
          <Text style={styles.installBtnText}>ติดตั้ง</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F4' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  subtitle: { fontSize: 11, color: colors.text.secondary, fontWeight: '600', marginTop: 1 },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 10 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: '#2A2F2C', borderColor: '#2A2F2C' },
  modeText: { fontSize: 11.5, fontWeight: '800', color: colors.text.secondary },
  modeTextActive: { color: '#fff' },
  catChips: { paddingHorizontal: 14, gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface.card,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  catChipActive: { backgroundColor: colors.brand.primaryDark, borderColor: colors.brand.primaryDark },
  catChipText: { fontSize: 11, fontWeight: '800', color: colors.text.secondary },
  manualBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  selectAllBtn: {
    backgroundColor: colors.brand.mist,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectAllText: { fontSize: 11, fontWeight: '900', color: colors.brand.primaryDark },
  meta: { fontSize: 11, color: colors.text.muted, fontWeight: '600' },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface.card,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 9,
    marginBottom: 7,
  },
  productRowActive: { borderColor: colors.brand.primaryDark, backgroundColor: colors.brand.mist },
  productThumb: { width: 42, height: 42, borderRadius: 9, backgroundColor: '#0B1F17' },
  productName: { fontSize: 12, fontWeight: '800', color: colors.text.primary },
  price: { fontSize: 12, fontWeight: '900', color: colors.accent.live },
  summaryCard: {
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    alignItems: 'center',
    gap: 8,
    padding: 22,
  },
  summaryBig: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  dupNote: { fontSize: 11, fontWeight: '800', color: colors.accent.warning },
  installBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  installCount: { fontSize: 13, fontWeight: '900', color: colors.text.primary },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  installBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
