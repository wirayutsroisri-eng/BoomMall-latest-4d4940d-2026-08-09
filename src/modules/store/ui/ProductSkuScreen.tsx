import React, { useMemo } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  shouldReorder,
  stockStatusOf,
} from '@/modules/commerce/domain/stock-core';
import type { SkuVariant, StockLedgerEntry, WarehouseId } from '@/modules/commerce/domain/types';
import { useWarehouseStore, MY_SHOP_ID } from '@/modules/warehouse/state/warehouse-store';
import { LedgerRow } from './LedgerScreen';
import { colors } from '@/shared/theme/colors';

const STATUS_META = {
  ready: { label: 'พร้อมขาย', color: '#22C55E' },
  low: { label: 'ใกล้หมด', color: '#F5A524' },
  out: { label: 'หมดสต็อก', color: '#FF3B4A' },
} as const;

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

export function ProductSkuScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const stockByKey = useInventoryStore((s) => s.stockByKey);
  const warehouses = useInventoryStore((s) => s.warehouses);
  const ledger = useInventoryStore((s) => s.ledger);
  const restock = useInventoryStore((s) => s.restock);
  const adjustStock = useInventoryStore((s) => s.adjustStock);
  const transferStock = useInventoryStore((s) => s.transferStock);
  const setLowStockThreshold = useInventoryStore((s) => s.setLowStockThreshold);
  const warehousesShared = useWarehouseStore((s) => s.warehouses);
  const canI = useWarehouseStore((s) => s.canI);

  const master = masters.find((m) => m.id === id);
  const productVariants = useMemo(
    () => variants.filter((v) => v.masterSkuId === id),
    [variants, id],
  );
  const variantIds = useMemo(() => new Set(productVariants.map((v) => v.id)), [productVariants]);

  const productLedger = useMemo(
    () => ledger.filter((e) => variantIds.has(e.variantId)).slice(0, 30),
    [ledger, variantIds],
  );

  if (!master) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, alignItems: 'center' }]}>
        <Text style={styles.title}>ไม่พบสินค้า</Text>
      </View>
    );
  }

  // Shared products: only the warehouse owner (or EDIT_STOCK members) may mutate stock
  const isMine = !master.ownerShopId || master.ownerShopId === MY_SHOP_ID;
  const sourceWarehouse = warehousesShared.find((w) => w.ownerShopId === master.ownerShopId);
  const canEditStock = isMine || (sourceWarehouse ? canI(sourceWarehouse.id, 'EDIT_STOCK') : false);

  const rowsOf = (variantId: string) =>
    Object.values(stockByKey).filter((r) => r.variantId === variantId);

  const doRestock = (variant: SkuVariant, warehouseId: WarehouseId) => {
    Alert.prompt(
      `เติมสต็อก · ${variant.sku}`,
      `คลัง ${warehouseId} — ใส่จำนวนที่เติม`,
      (text) => {
        const qty = Number(text);
        if (!Number.isFinite(qty) || qty <= 0) return;
        const result = restock(variant.id, warehouseId, qty, 'เติมสต็อกจากหน้า SKU Management');
        if (result.ok) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Alert.alert('เติมสต็อกไม่สำเร็จ', result.reason);
        }
      },
      'plain-text',
      '',
      'number-pad',
    );
  };

  const doAdjust = (variant: SkuVariant, warehouseId: WarehouseId, currentOnHand: number) => {
    Alert.prompt(
      `ปรับยอดสต็อก · ${variant.sku}`,
      `คลัง ${warehouseId} — ยอดปัจจุบัน ${currentOnHand} ใส่ยอดใหม่ (บันทึกลง Ledger เสมอ)`,
      (text) => {
        const next = Number(text);
        if (!Number.isFinite(next) || next < 0) return;
        const result = adjustStock(
          variant.id,
          warehouseId,
          next,
          `ปรับยอดด้วยตนเอง (${currentOnHand} → ${next})`,
        );
        if (result.ok) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Alert.alert(
            'ปรับยอดไม่สำเร็จ',
            result.reason === 'INSUFFICIENT'
              ? 'ยอดใหม่ต่ำกว่าจำนวนที่ถูกจองไว้ (Reserved) — ห้าม Available ติดลบ'
              : result.reason,
          );
        }
      },
      'plain-text',
      String(currentOnHand),
      'number-pad',
    );
  };

  const doTransfer = (variant: SkuVariant, fromWarehouseId: WarehouseId) => {
    const targets = warehouses.filter((w) => w.id !== fromWarehouseId);
    Alert.alert('โอนสต็อกไปคลังอื่น', `จาก ${fromWarehouseId}`, [
      ...targets.map((w) => ({
        text: w.name,
        onPress: () =>
          Alert.prompt(`โอนไป ${w.name}`, 'ใส่จำนวนที่โอน', (text) => {
            const qty = Number(text);
            if (!Number.isFinite(qty) || qty <= 0) return;
            const result = transferStock(variant.id, fromWarehouseId, w.id, qty);
            if (result.ok) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('โอนไม่สำเร็จ', result.reason === 'INSUFFICIENT' ? 'สต็อกพร้อมโอนไม่พอ' : result.reason);
            }
          }, 'plain-text', '', 'number-pad'),
      })),
      { text: 'ยกเลิก', style: 'cancel' },
    ]);
  };

  const doThreshold = (variant: SkuVariant) => {
    const current = variant.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    Alert.prompt(
      `Low Stock Threshold · ${variant.sku}`,
      `แจ้งเตือนเมื่อ Available ≤ ค่านี้ (ปัจจุบัน ${current})`,
      (text) => {
        const next = Number(text);
        if (!Number.isFinite(next) || next < 0) return;
        setLowStockThreshold(variant.id, next);
        void Haptics.selectionAsync();
      },
      'plain-text',
      String(current),
      'number-pad',
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          จัดการสต็อก & SKU
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Product summary */}
      <View style={styles.productCard}>
        <Image
          source={{ uri: master.imageUri ?? masterContentImage(master.id) }}
          style={styles.productImage}
        />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.title} numberOfLines={2}>
            {master.title}
          </Text>
          <Text style={styles.meta}>
            {master.masterSku} · {master.channel}
          </Text>
          {!isMine ? (
            <View style={styles.sourceBadge}>
              <Ionicons name="business" size={10} color="#fff" />
              <Text style={styles.sourceBadgeText}>
                {sourceWarehouse?.name ?? master.shopName} · สต็อกกลาง
              </Text>
            </View>
          ) : null}
          {master.description ? (
            <Text style={styles.desc} numberOfLines={3}>
              {master.description}
            </Text>
          ) : null}
        </View>
      </View>

      {!canEditStock ? (
        <View style={styles.readOnlyBanner}>
          <Ionicons name="lock-closed" size={13} color={colors.accent.warning} />
          <Text style={styles.readOnlyText}>
            สินค้าจากคลังที่เชื่อม — คุณดูสต็อกได้ (VIEW_STOCK) แต่แก้ไขได้เฉพาะผู้มีสิทธิ์ EDIT_STOCK
          </Text>
        </View>
      ) : null}

      {/* SKU list */}
      <Text style={styles.sectionTitle}>SKU ทั้งหมด ({productVariants.length})</Text>
      {productVariants.map((variant) => {
        const rows = rowsOf(variant.id);
        const available = rows.reduce((s, r) => s + Math.max(0, r.onHand - r.reserved), 0);
        const reserved = rows.reduce((s, r) => s + r.reserved, 0);
        const onHand = rows.reduce((s, r) => s + r.onHand, 0);
        const threshold = variant.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
        const status = stockStatusOf(available, threshold);
        const reorder = shouldReorder({ available, threshold });
        const meta = STATUS_META[status];

        return (
          <View key={variant.id} style={styles.skuCard}>
            <View style={styles.skuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.skuCode}>{variant.sku}</Text>
                <Text style={styles.meta}>
                  {variant.label} · {formatTHB(variant.price)}
                  {variant.cost != null ? ` · ทุน ${formatTHB(variant.cost)}` : ''}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: meta.color }]}>
                <Text style={styles.statusPillText}>{meta.label}</Text>
              </View>
            </View>

            <View style={styles.numbersRow}>
              <NumberCell label="On Hand" value={onHand} />
              <NumberCell label="Reserved" value={reserved} />
              <NumberCell label="Available" value={available} strong />
              <Pressable onPress={() => canEditStock && doThreshold(variant)} style={styles.numberCell}>
                <Text style={styles.numberValue}>{threshold}</Text>
                <Text style={styles.numberLabel}>แจ้งเตือน ≤</Text>
              </Pressable>
            </View>

            {reorder ? (
              <View style={styles.reorderHint}>
                <Ionicons name="alert-circle" size={13} color={colors.accent.warning} />
                <Text style={styles.reorderHintText}>ควรเติมสินค้า — Available ต่ำกว่าเกณฑ์</Text>
              </View>
            ) : null}

            {rows.map((row) => (
              <View key={`${row.variantId}-${row.warehouseId}`} style={styles.warehouseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.warehouseName}>
                    {warehouses.find((w) => w.id === row.warehouseId)?.name ?? row.warehouseId}
                  </Text>
                  <Text style={styles.meta}>
                    On Hand {row.onHand} · จอง {row.reserved} · เหลือ{' '}
                    {Math.max(0, row.onHand - row.reserved)} · rev {row.revision}
                  </Text>
                </View>
                {canEditStock ? (
                  <View style={styles.rowActions}>
                    <Pressable
                      style={styles.miniBtn}
                      onPress={() => doRestock(variant, row.warehouseId)}
                    >
                      <Text style={styles.miniBtnText}>+ เติม</Text>
                    </Pressable>
                    <Pressable
                      style={styles.miniBtn}
                      onPress={() => doAdjust(variant, row.warehouseId, row.onHand)}
                    >
                      <Text style={styles.miniBtnText}>ปรับยอด</Text>
                    </Pressable>
                    <Pressable
                      style={styles.miniBtn}
                      onPress={() => doTransfer(variant, row.warehouseId)}
                    >
                      <Text style={styles.miniBtnText}>โอน</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}

      {/* Movement history */}
      <Text style={styles.sectionTitle}>ประวัติความเคลื่อนไหว (Inventory Ledger)</Text>
      {productLedger.length === 0 ? (
        <Text style={[styles.meta, { paddingHorizontal: 16 }]}>
          ยังไม่มีความเคลื่อนไหว — ทุกการเปลี่ยนสต็อกจะถูกบันทึกที่นี่อัตโนมัติ
        </Text>
      ) : (
        productLedger.map((entry: StockLedgerEntry) => <LedgerRow key={entry.id} entry={entry} />)
      )}
      <Pressable style={styles.allLedgerBtn} onPress={() => router.push('/store/ledger')}>
        <Ionicons name="receipt-outline" size={14} color={colors.brand.primaryDark} />
        <Text style={styles.allLedgerText}>ดู Ledger ทั้งร้าน (ทุกสินค้า)</Text>
      </Pressable>
    </ScrollView>
  );
}

function NumberCell({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.numberCell}>
      <Text style={[styles.numberValue, strong && { color: colors.brand.primaryDark }]}>
        {value.toLocaleString('th-TH')}
      </Text>
      <Text style={styles.numberLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F4' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  topTitle: { fontSize: 16, fontWeight: '900', color: colors.text.primary },
  productCard: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 14,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    marginBottom: 10,
  },
  productImage: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#0B1F17' },
  title: { fontSize: 15, fontWeight: '900', color: colors.text.primary },
  meta: { fontSize: 11, color: colors.text.muted, fontWeight: '600' },
  desc: { fontSize: 11, color: colors.text.secondary, lineHeight: 15 },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent.info,
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  sourceBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#FFF6E5',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,165,36,0.35)',
  },
  readOnlyText: { flex: 1, fontSize: 11, color: '#8A6210', fontWeight: '600', lineHeight: 15 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  skuCard: {
    marginHorizontal: 14,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  skuHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skuCode: { fontSize: 13, fontWeight: '900', color: colors.text.primary },
  statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusPillText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  numbersRow: { flexDirection: 'row', gap: 8 },
  numberCell: {
    flex: 1,
    backgroundColor: '#F3F5F4',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 1,
  },
  numberValue: { fontSize: 14, fontWeight: '900', color: colors.text.primary },
  numberLabel: { fontSize: 9, fontWeight: '700', color: colors.text.muted },
  reorderHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF6E5',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  reorderHintText: { fontSize: 11, fontWeight: '800', color: '#8A6210' },
  warehouseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
    paddingTop: 8,
  },
  warehouseName: { fontSize: 12, fontWeight: '800', color: colors.text.primary },
  rowActions: { flexDirection: 'row', gap: 5 },
  miniBtn: {
    backgroundColor: colors.brand.mist,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  miniBtnText: { fontSize: 10, fontWeight: '900', color: colors.brand.primaryDark },
  allLedgerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginTop: 4,
    backgroundColor: colors.brand.mist,
    borderRadius: 12,
    paddingVertical: 12,
  },
  allLedgerText: { fontSize: 12, fontWeight: '900', color: colors.brand.primaryDark },
});
