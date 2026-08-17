import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  availableOf,
  stockStatusOf,
} from '@/modules/commerce/domain/stock-core';
import type { SkuVariant, StockLedgerEntry, WarehouseId, WarehouseStock } from '@/modules/commerce/domain/types';
import { useWarehouseStore, MY_SHOP_ID } from '@/modules/warehouse/state/warehouse-store';
import { LedgerRow } from './LedgerScreen';
import { colors } from '@/shared/theme/colors';
import { promptText } from '@/shared/components/AppPrompt';

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

function primaryRow(rows: WarehouseStock[]): WarehouseStock | undefined {
  if (!rows.length) return undefined;
  return [...rows].sort((a, b) => availableOf(b) - availableOf(a))[0];
}

function friendlyLedgerLine(entry: StockLedgerEntry): string {
  const abs = Math.abs(entry.qtyChange);
  switch (entry.type) {
    case 'RESTOCK':
      return `+${abs} เติมสินค้า`;
    case 'SALE':
      return `-${abs} ขายสินค้า`;
    case 'ORDER_CANCEL':
    case 'RETURN':
      return `+${abs} ลูกค้ายกเลิก/คืน`;
    case 'ORDER_RESERVE':
      return `จอง ${abs} ชิ้น (ออเดอร์)`;
    case 'TRANSFER':
      return entry.qtyChange >= 0 ? `+${abs} รับโอนคลัง` : `-${abs} โอนออก`;
    case 'MANUAL_ADJUSTMENT':
      return entry.qtyChange >= 0 ? `+${abs} ปรับจำนวน` : `-${abs} ปรับจำนวน`;
    default:
      return `${entry.qtyChange > 0 ? '+' : ''}${entry.qtyChange} เปลี่ยนแปลง`;
  }
}

export function ProductSkuScreen() {
  const insets = useSafeAreaInsets();
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const [advanced, setAdvanced] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const stockByKey = useInventoryStore((s) => s.stockByKey);
  const warehouses = useInventoryStore((s) => s.warehouses);
  const ledger = useInventoryStore((s) => s.ledger);
  const restock = useInventoryStore((s) => s.restock);
  const adjustStock = useInventoryStore((s) => s.adjustStock);
  const transferStock = useInventoryStore((s) => s.transferStock);
  const setLowStockThreshold = useInventoryStore((s) => s.setLowStockThreshold);
  const addVariantToMaster = useInventoryStore((s) => s.addVariantToMaster);
  const ensureStockRow = useInventoryStore((s) => s.ensureStockRow);
  const warehousesShared = useWarehouseStore((s) => s.warehouses);
  const canI = useWarehouseStore((s) => s.canI);

  const master = masters.find((m) => m.id === id);
  const productVariants = useMemo(
    () => variants.filter((v) => v.masterSkuId === id),
    [variants, id],
  );
  const variantIds = useMemo(() => new Set(productVariants.map((v) => v.id)), [productVariants]);
  const productLedger = useMemo(
    () => ledger.filter((e) => variantIds.has(e.variantId)).slice(0, 40),
    [ledger, variantIds],
  );

  if (!master) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 12, alignItems: 'center' }]}>
        <Text style={styles.topTitle}>ไม่พบสินค้า</Text>
      </View>
    );
  }

  const isMine = !master.ownerShopId || master.ownerShopId === MY_SHOP_ID;
  const sourceWarehouse = warehousesShared.find((w) => w.ownerShopId === master.ownerShopId);
  const canEditStock = isMine || (sourceWarehouse ? canI(sourceWarehouse.id, 'EDIT_STOCK') : false);
  const sharedLabel = sourceWarehouse?.name ?? master.shopName ?? 'คลัง Boom EV';

  const rowsOf = (variantId: string) =>
    Object.values(stockByKey).filter((r) => r.variantId === variantId);

  const defaultWarehouseId = (): WarehouseId => {
    const first = productVariants[0] ? rowsOf(productVariants[0].id)[0]?.warehouseId : undefined;
    return first ?? 'WH-CTI-MAIN';
  };

  const resolvePrimaryRow = (variant: SkuVariant): WarehouseStock | undefined => {
    const rows = rowsOf(variant.id);
    const existing = primaryRow(rows);
    if (existing) return existing;
    const wh = defaultWarehouseId();
    ensureStockRow(variant.id, wh);
    return useInventoryStore.getState().stockByKey[`${variant.id}::${wh}`];
  };

  const bumpSellable = (variant: SkuVariant, delta: number) => {
    if (!canEditStock) return;
    const row = resolvePrimaryRow(variant);
    if (!row) return;

    if (delta > 0) {
      const result = restock(variant.id, row.warehouseId, delta, 'เพิ่มจำนวนสินค้า');
      if (result.ok) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else Alert.alert('เพิ่มไม่ได้', result.reason);
      return;
    }

    const nextOnHand = Math.max(row.reserved, row.onHand + delta);
    if (nextOnHand === row.onHand) {
      Alert.alert('ลดไม่ได้', 'มียอดที่ถูกจองไว้แล้ว — ขายได้น้อยสุดตามยอดจอง');
      return;
    }
    const result = adjustStock(variant.id, row.warehouseId, nextOnHand, 'ลดจำนวนสินค้า');
    if (result.ok) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else Alert.alert('ลดไม่ได้', 'มียอดจองอยู่ ไม่สามารถลดต่ำกว่านั้น');
  };

  const setSellableQty = (variant: SkuVariant, targetAvailable: number) => {
    if (!canEditStock) return;
    if (!Number.isFinite(targetAvailable) || targetAvailable < 0) return;
    const row = resolvePrimaryRow(variant);
    if (!row) return;

    const rows = rowsOf(variant.id);
    const others = rows
      .filter((r) => !(r.variantId === row.variantId && r.warehouseId === row.warehouseId))
      .reduce((s, r) => s + availableOf(r), 0);
    const needAvailableOnPrimary = Math.max(0, Math.floor(targetAvailable) - others);
    const newOnHand = needAvailableOnPrimary + row.reserved;
    const result = adjustStock(
      variant.id,
      row.warehouseId,
      newOnHand,
      `ตั้งจำนวนขายได้เป็น ${Math.floor(targetAvailable)}`,
    );
    if (result.ok) void Haptics.selectionAsync();
    else Alert.alert('ตั้งจำนวนไม่ได้', 'มียอดจองอยู่ ไม่สามารถตั้งต่ำกว่านั้น');
  };

  const promptSellable = (variant: SkuVariant, currentAvailable: number) => {
    if (!canEditStock) return;
    void promptText({
      title: 'จำนวนที่ขายได้',
      message: `${variant.label} — ตอนนี้ขายได้ ${currentAvailable} ชิ้น`,
      defaultValue: String(currentAvailable),
      keyboardType: 'number-pad',
    }).then((text) => {
      const next = Number(text);
      if (!Number.isFinite(next) || next < 0) return;
      setSellableQty(variant, next);
    });
  };

  const promptAddVariant = async () => {
    if (!canEditStock) return;
    const label = await promptText({
      title: 'ชื่อรุ่น',
      message: 'เช่น 30Ah หรือ สีดำ',
      placeholder: '30Ah',
    });
    const name = label?.trim();
    if (!name) return;
    const priceText = await promptText({
      title: 'ราคา (บาท)',
      message: `รุ่น ${name}`,
      defaultValue: String(master.basePrice || 1000),
      keyboardType: 'number-pad',
    });
    const price = Number(priceText);
    if (!Number.isFinite(price) || price <= 0) {
      if (priceText != null) Alert.alert('ราคายังไม่ถูก', 'ใส่ตัวเลขมากกว่า 0 นะ');
      return;
    }
    const qtyText = await promptText({
      title: 'มีกี่ชิ้น',
      message: 'จำนวนที่พร้อมขาย',
      defaultValue: '10',
      keyboardType: 'number-pad',
    });
    const onHand = Number(qtyText);
    if (!Number.isFinite(onHand) || onHand < 0) {
      if (qtyText != null) Alert.alert('จำนวนยังไม่ถูก', 'ใส่ตัวเลข 0 ขึ้นไป');
      return;
    }
    const idNew = addVariantToMaster(master.id, {
      label: name,
      price,
      onHand,
      warehouseId: defaultWarehouseId(),
    });
    if (idNew) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert('เพิ่มไม่ได้', 'ลองใหม่อีกครั้ง');
    }
  };

  const promptLowStockAmount = (variant: SkuVariant) => {
    const current = variant.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    void promptText({
      title: 'แจ้งเมื่อเหลือกี่ชิ้น',
      message: 'ระบบจะเตือนเมื่อขายได้เหลือไม่เกินจำนวนนี้',
      defaultValue: String(current > 0 ? current : DEFAULT_LOW_STOCK_THRESHOLD),
      keyboardType: 'number-pad',
    }).then((text) => {
      const next = Number(text);
      if (!Number.isFinite(next) || next < 0) return;
      setLowStockThreshold(variant.id, next);
      void Haptics.selectionAsync();
    });
  };

  const doRestock = (variant: SkuVariant, warehouseId: WarehouseId) => {
    void promptText({
      title: `เติมสต็อก · ${variant.sku}`,
      message: `คลัง ${warehouseId}`,
      keyboardType: 'number-pad',
    }).then((text) => {
      const qty = Number(text);
      if (!Number.isFinite(qty) || qty <= 0) return;
      const result = restock(variant.id, warehouseId, qty, 'เติมสต็อก (ขั้นสูง)');
      if (result.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Alert.alert('เติมไม่สำเร็จ', result.reason);
    });
  };

  const doAdjust = (variant: SkuVariant, warehouseId: WarehouseId, currentOnHand: number) => {
    void promptText({
      title: `ปรับ On Hand · ${variant.sku}`,
      message: `ปัจจุบัน ${currentOnHand}`,
      defaultValue: String(currentOnHand),
      keyboardType: 'number-pad',
    }).then((text) => {
      const next = Number(text);
      if (!Number.isFinite(next) || next < 0) return;
      const result = adjustStock(variant.id, warehouseId, next, `ปรับยอด (${currentOnHand} → ${next})`);
      if (result.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Alert.alert('ปรับไม่สำเร็จ', result.reason === 'INSUFFICIENT' ? 'ต่ำกว่า Reserved' : result.reason);
    });
  };

  const doTransfer = (variant: SkuVariant, fromWarehouseId: WarehouseId) => {
    const targets = warehouses.filter((w) => w.id !== fromWarehouseId);
    Alert.alert('โอนสต็อก', `จาก ${fromWarehouseId}`, [
      ...targets.map((w) => ({
        text: w.name,
        onPress: () => {
          void promptText({
            title: `โอนไป ${w.name}`,
            message: 'จำนวน',
            keyboardType: 'number-pad',
          }).then((text) => {
            const qty = Number(text);
            if (!Number.isFinite(qty) || qty <= 0) return;
            const result = transferStock(variant.id, fromWarehouseId, w.id, qty);
            if (result.ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            else Alert.alert('โอนไม่สำเร็จ', result.reason === 'INSUFFICIENT' ? 'สต็อกไม่พอ' : result.reason);
          });
        },
      })),
      { text: 'ยกเลิก', style: 'cancel' },
    ]);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          รายละเอียดสินค้า
        </Text>
        {isMine ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              void Haptics.selectionAsync();
              router.push({ pathname: '/products/[id]/edit', params: { id: master.id } });
            }}
            accessibilityLabel="แก้ไขสินค้า"
          >
            <Text style={styles.editLink}>แก้ไข</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.productCard}>
        <Image
          source={{ uri: master.imageUri ?? master.imageUris?.[0] ?? masterContentImage(master.id) }}
          style={styles.productImage}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.productTitle} numberOfLines={2}>
            {master.title}
          </Text>
          {!isMine ? (
            <Text style={styles.sharedHint}>สินค้าจากคลัง {sharedLabel}</Text>
          ) : (
            <Text style={styles.sharedHint}>ร้านคุณ · พร้อมปรับจำนวนได้เลย</Text>
          )}
        </View>
      </View>

      {!canEditStock ? (
        <View style={styles.readOnlyBanner}>
          <Ionicons name="eye-outline" size={16} color={colors.accent.warning} />
          <Text style={styles.readOnlyText}>
            ดูได้อย่างเดียว — ไม่มีสิทธิ์แก้จำนวนสินค้าจากคลังนี้
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>รุ่นสินค้า ({productVariants.length})</Text>

      {productVariants.map((variant) => {
        const rows = rowsOf(variant.id);
        const sellable = rows.reduce((s, r) => s + availableOf(r), 0);
        const threshold = variant.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
        const alertOn = threshold > 0;
        const status = stockStatusOf(sellable, alertOn ? threshold : 0);
        const row = primaryRow(rows);

        return (
          <View key={variant.id} style={styles.variantCard}>
            <View style={styles.variantTop}>
              <Image
                source={{
                  uri:
                    variant.imageUri ??
                    master.imageUri ??
                    master.imageUris?.[0] ??
                    masterContentImage(master.id),
                }}
                style={styles.variantThumb}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.variantName}>{variant.label}</Text>
                <Text style={styles.variantPrice}>{formatTHB(variant.price)}</Text>
              </View>
            </View>

            <Text style={styles.sellableLabel}>
              {sellable > 0 ? `ขายได้ ${sellable.toLocaleString('th-TH')} ชิ้น` : 'สินค้าหมด'}
            </Text>

            {canEditStock ? (
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => bumpSellable(variant, -1)}
                  hitSlop={6}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Pressable style={styles.stepValueHit} onPress={() => promptSellable(variant, sellable)}>
                  <Text style={styles.stepValue}>{sellable.toLocaleString('th-TH')}</Text>
                </Pressable>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => bumpSellable(variant, 1)}
                  hitSlop={6}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.stepValueReadonly}>{sellable.toLocaleString('th-TH')}</Text>
            )}

            {status === 'ready' ? (
              <Text style={styles.statusReady}>🟢 พร้อมขาย</Text>
            ) : null}
            {status === 'low' ? (
              <Text style={styles.statusLow}>
                🟠 ใกล้หมด — เหลือ {sellable.toLocaleString('th-TH')} ชิ้น
              </Text>
            ) : null}
            {status === 'out' ? <Text style={styles.statusOut}>🔴 สินค้าหมด</Text> : null}

            <View style={styles.alertRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>แจ้งเตือนเมื่อสินค้าเหลือน้อย</Text>
                {alertOn ? (
                  <Pressable onPress={() => canEditStock && promptLowStockAmount(variant)}>
                    <Text style={styles.alertSub}>
                      แจ้งเมื่อเหลือ{' '}
                      <Text style={styles.alertNum}>{threshold}</Text> ชิ้น
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.alertSub}>ปิดอยู่</Text>
                )}
              </View>
              {canEditStock ? (
                <Pressable
                  style={[styles.alertSwitch, alertOn && styles.alertSwitchOn]}
                  onPress={() => {
                    setLowStockThreshold(
                      variant.id,
                      alertOn ? 0 : variant.lowStockThreshold || DEFAULT_LOW_STOCK_THRESHOLD,
                    );
                    void Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.alertSwitchText, alertOn && styles.alertSwitchTextOn]}>
                    {alertOn ? 'เปิด' : 'ปิด'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {advanced ? (
              <View style={styles.advancedBlock}>
                <Text style={styles.advLine}>SKU Code · {variant.sku}</Text>
                <Text style={styles.advLine}>
                  On Hand {rows.reduce((s, r) => s + r.onHand, 0)} · Reserved{' '}
                  {rows.reduce((s, r) => s + r.reserved, 0)} · Available {sellable}
                </Text>
                <Text style={styles.advLine}>
                  Low Stock Threshold · {threshold} {alertOn ? '' : '(off)'}
                </Text>
                {rows.map((r) => (
                  <View key={`${r.variantId}-${r.warehouseId}`} style={styles.advWarehouse}>
                    <Text style={styles.advLine}>
                      Warehouse {warehouses.find((w) => w.id === r.warehouseId)?.name ?? r.warehouseId}
                    </Text>
                    <Text style={styles.advMeta}>
                      On Hand {r.onHand} · Reserved {r.reserved} · Available {availableOf(r)} · rev{' '}
                      {r.revision}
                    </Text>
                    {canEditStock ? (
                      <View style={styles.advActions}>
                        <Pressable style={styles.miniBtn} onPress={() => doRestock(variant, r.warehouseId)}>
                          <Text style={styles.miniBtnText}>+ เติม</Text>
                        </Pressable>
                        <Pressable
                          style={styles.miniBtn}
                          onPress={() => doAdjust(variant, r.warehouseId, r.onHand)}
                        >
                          <Text style={styles.miniBtnText}>ปรับยอด</Text>
                        </Pressable>
                        <Pressable style={styles.miniBtn} onPress={() => doTransfer(variant, r.warehouseId)}>
                          <Text style={styles.miniBtnText}>โอน</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
                {!row ? <Text style={styles.advMeta}>ยังไม่มีแถว Inventory</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {canEditStock ? (
        <Pressable style={styles.addVariantBtn} onPress={promptAddVariant}>
          <Ionicons name="add" size={20} color={colors.brand.primaryDark} />
          <Text style={styles.addVariantText}>เพิ่มรุ่นสินค้า</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={styles.historyHeader}
        onPress={() => setHistoryOpen((v) => !v)}
      >
        <Text style={styles.historyTitle}>ประวัติการเปลี่ยนแปลง</Text>
        <Ionicons
          name={historyOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.text.secondary}
        />
      </Pressable>
      {historyOpen ? (
        <View style={styles.historyBody}>
          {productLedger.length === 0 ? (
            <Text style={styles.historyEmpty}>ยังไม่มีรายการ</Text>
          ) : (
            productLedger.slice(0, 12).map((entry) => (
              <Text key={entry.id} style={styles.historyLine}>
                {friendlyLedgerLine(entry)}
              </Text>
            ))
          )}
          {advanced ? (
            <>
              <Text style={[styles.sectionTitle, { paddingHorizontal: 0, marginTop: 12 }]}>
                Inventory Ledger (เทคนิค)
              </Text>
              {productLedger.slice(0, 8).map((entry) => (
                <LedgerRow key={`adv-${entry.id}`} entry={entry} />
              ))}
              <Pressable style={styles.allLedgerBtn} onPress={() => router.push('/store/ledger')}>
                <Text style={styles.allLedgerText}>ดู Ledger ทั้งร้าน</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      <Pressable
        style={styles.advancedToggle}
        onPress={() => {
          setAdvanced((v) => !v);
          void Haptics.selectionAsync();
        }}
      >
        <Text style={styles.advancedToggleText}>
          ⚙️ การตั้งค่าสต๊อกขั้นสูง {advanced ? '· เปิดอยู่' : ''}
        </Text>
        <Text style={styles.advancedToggleHint}>
          {advanced ? 'แตะเพื่อซ่อนรายละเอียดคลัง/SKU' : 'สำหรับแอดมินหรือคนจัดการคลังละเอียด'}
        </Text>
      </Pressable>

      {advanced ? (
        <View style={styles.advancedProductMeta}>
          <Text style={styles.advLine}>Master SKU · {master.masterSku}</Text>
          <Text style={styles.advLine}>Channel · {master.channel}</Text>
          <Text style={styles.advLine}>Product ID · {master.id}</Text>
        </View>
      ) : null}
    </ScrollView>
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
  topTitle: { fontSize: 17, fontWeight: '900', color: colors.text.primary, flex: 1, textAlign: 'center' },
  editLink: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.brand.primaryDark,
    minWidth: 40,
    textAlign: 'right',
  },
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
  productTitle: { fontSize: 16, fontWeight: '900', color: colors.text.primary },
  sharedHint: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#FFF6E5',
    borderRadius: 12,
    padding: 12,
  },
  readOnlyText: { flex: 1, fontSize: 13, color: '#8A6210', fontWeight: '600', lineHeight: 18 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
  },
  variantCard: {
    marginHorizontal: 14,
    backgroundColor: colors.surface.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  variantTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  variantThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.brand.forest,
  },
  variantName: { fontSize: 20, fontWeight: '900', color: colors.text.primary },
  variantPrice: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    color: colors.brand.primaryDark,
  },
  sellableLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.brand.primaryDark,
    marginTop: -2,
  },
  stepValueHit: {
    minWidth: 88,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  stepValue: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  stepValueReadonly: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
  },
  statusReady: { fontSize: 15, fontWeight: '800', color: '#15803D' },
  statusLow: { fontSize: 15, fontWeight: '800', color: '#B45309' },
  statusOut: { fontSize: 15, fontWeight: '800', color: '#DC2626' },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F3F5F4',
    borderRadius: 14,
    padding: 12,
  },
  alertTitle: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  alertSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  alertNum: { fontWeight: '900', color: colors.brand.primaryDark },
  alertSwitch: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E5E7E6',
  },
  alertSwitchOn: { backgroundColor: colors.brand.primary },
  alertSwitchText: { fontWeight: '900', fontSize: 13, color: colors.text.secondary },
  alertSwitchTextOn: { color: colors.brand.ink },
  addVariantBtn: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(10,22,17,0.2)',
    backgroundColor: '#fff',
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addVariantText: { fontSize: 16, fontWeight: '900', color: colors.brand.primaryDark },
  historyHeader: {
    marginHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  historyTitle: { fontSize: 15, fontWeight: '900', color: colors.text.primary },
  historyBody: {
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
    gap: 8,
  },
  historyEmpty: { fontSize: 13, color: colors.text.muted, fontWeight: '600' },
  historyLine: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  advancedToggle: {
    marginHorizontal: 14,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#EEF1F0',
  },
  advancedToggleText: { fontSize: 14, fontWeight: '900', color: colors.text.primary },
  advancedToggleHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  advancedBlock: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
    gap: 6,
  },
  advancedProductMeta: {
    marginHorizontal: 14,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#E8ECEA',
    gap: 4,
  },
  advLine: { fontSize: 12, fontWeight: '700', color: colors.text.primary },
  advMeta: { fontSize: 11, fontWeight: '600', color: colors.text.muted },
  advWarehouse: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
    gap: 4,
  },
  advActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  miniBtn: {
    backgroundColor: colors.brand.mist,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  miniBtnText: { fontSize: 11, fontWeight: '900', color: colors.brand.primaryDark },
  allLedgerBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.brand.mist,
    borderRadius: 10,
  },
  allLedgerText: { fontSize: 12, fontWeight: '900', color: colors.brand.primaryDark },
});
