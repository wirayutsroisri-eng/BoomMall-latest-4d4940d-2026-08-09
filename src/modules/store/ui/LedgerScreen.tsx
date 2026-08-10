import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import type { StockLedgerEntry, StockLedgerType } from '@/modules/commerce/domain/types';
import { colors } from '@/shared/theme/colors';

export const LEDGER_TYPE_LABEL: Record<StockLedgerType, string> = {
  RESTOCK: 'เติมสต็อก',
  SALE: 'ขาย',
  ORDER_RESERVE: 'จองออเดอร์',
  ORDER_CANCEL: 'ยกเลิก/คืนจอง',
  RETURN: 'รับคืนสินค้า',
  MANUAL_ADJUSTMENT: 'ปรับยอด',
  TRANSFER: 'โอนคลัง',
};

const TYPE_COLOR: Record<StockLedgerType, string> = {
  RESTOCK: '#22C55E',
  SALE: '#FF3B4A',
  ORDER_RESERVE: '#F5A524',
  ORDER_CANCEL: '#8A9A92',
  RETURN: '#2E8CFF',
  MANUAL_ADJUSTMENT: '#8B5CF6',
  TRANSFER: '#0EA5B7',
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
}

export function LedgerRow({ entry }: { entry: StockLedgerEntry }) {
  const sign = entry.qtyChange > 0 ? '+' : '';
  return (
    <View style={rowStyles.card}>
      <View style={[rowStyles.typePill, { backgroundColor: TYPE_COLOR[entry.type] }]}>
        <Text style={rowStyles.typePillText}>{LEDGER_TYPE_LABEL[entry.type]}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={rowStyles.sku}>{entry.sku}</Text>
        <Text style={rowStyles.meta}>
          {entry.availableBefore} → {entry.availableAfter} (Available) · On Hand {entry.onHandAfter} ·
          จอง {entry.reservedAfter}
        </Text>
        {entry.reason ? <Text style={rowStyles.reason}>{entry.reason}</Text> : null}
        {entry.orderRef ? <Text style={rowStyles.reason}>Order: {entry.orderRef}</Text> : null}
        <Text style={rowStyles.meta}>
          {entry.warehouseId} · {entry.actor} · {timeLabel(entry.at)}
        </Text>
      </View>
      <Text
        style={[
          rowStyles.qty,
          { color: entry.qtyChange >= 0 ? '#1B9C6E' : colors.accent.live },
        ]}
      >
        {sign}
        {entry.qtyChange}
      </Text>
    </View>
  );
}

export function LedgerScreen() {
  const insets = useSafeAreaInsets();
  const ledger = useInventoryStore((s) => s.ledger);
  const [typeFilter, setTypeFilter] = useState<StockLedgerType | 'all'>('all');

  const entries = useMemo(
    () => (typeFilter === 'all' ? ledger : ledger.filter((e) => e.type === typeFilter)),
    [ledger, typeFilter],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Inventory Ledger</Text>
          <Text style={styles.subtitle}>
            ประวัติสต็อกทุกเหตุการณ์ · {ledger.length.toLocaleString('th-TH')} รายการ (Audit Trail)
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {(['all', ...Object.keys(LEDGER_TYPE_LABEL)] as Array<StockLedgerType | 'all'>).map((t) => {
          const active = typeFilter === t;
          return (
            <Pressable
              key={t}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setTypeFilter(t)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t === 'all' ? 'ทั้งหมด' : LEDGER_TYPE_LABEL[t]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => <LedgerRow entry={item} />}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          <Text style={styles.empty}>
            ยังไม่มีความเคลื่อนไหว — ลองเติมสต็อก ขายสินค้า หรือลงสินค้าใหม่ แล้วระบบจะบันทึกให้อัตโนมัติ
          </Text>
        }
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 11,
    marginBottom: 8,
    marginHorizontal: 0,
  },
  typePill: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    minWidth: 64,
    alignItems: 'center',
  },
  typePillText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  sku: { fontSize: 12, fontWeight: '900', color: colors.text.primary },
  meta: { fontSize: 10, color: colors.text.muted, fontWeight: '600' },
  reason: { fontSize: 10, color: colors.text.secondary, fontWeight: '600' },
  qty: { fontSize: 15, fontWeight: '900' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F4' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text.primary },
  subtitle: { fontSize: 11, color: colors.text.secondary, fontWeight: '600', marginTop: 1 },
  chipsScroll: { flexGrow: 0, marginBottom: 10 },
  chips: { paddingHorizontal: 14, gap: 7 },
  chip: {
    backgroundColor: colors.surface.card,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  chipActive: { backgroundColor: '#2A2F2C', borderColor: '#2A2F2C' },
  chipText: { fontSize: 11, fontWeight: '800', color: colors.text.secondary },
  chipTextActive: { color: '#fff' },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    fontSize: 12,
    marginTop: 32,
    paddingHorizontal: 24,
    lineHeight: 18,
  },
});
