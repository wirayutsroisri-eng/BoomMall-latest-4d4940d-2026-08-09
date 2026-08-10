import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useCartStore } from '@/modules/commerce/state/cart-store';
import type { CommerceChannel, WarehouseId } from '@/modules/commerce/domain/types';
import { colors } from '@/shared/theme/colors';

const FILTERS: Array<CommerceChannel | 'ALL'> = ['ALL', 'B2B', 'B2C', 'C2C'];

export function ShopScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const warehouses = useInventoryStore((s) => s.warehouses);
  const totalAvailable = useInventoryStore((s) => s.totalAvailable);
  const listStockRows = useInventoryStore((s) => s.listStockRows);
  const addToCart = useCartStore((s) => s.addToCart);
  const checkout = useCartStore((s) => s.checkout);
  const lines = useCartStore((s) => s.lines);
  const lineCount = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);

  const products = useMemo(() => {
    if (filter === 'ALL') return masters;
    return masters.filter((m) => m.channel === filter);
  }, [filter, masters]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>Commerce Hub</Text>
      <Text style={styles.subtitle}>
        Shopify/Amazon Spec · Master SKU · Multi-Warehouse · Thread-Safe Cart
      </Text>

      <View style={styles.cartBar}>
        <Text style={styles.cartText}>
          ตะกร้า {lineCount} ชิ้น · ฿{subtotal.toLocaleString('th-TH')}
        </Text>
        <Pressable
          style={styles.checkoutBtn}
          onPress={() => {
            const result = checkout();
            Alert.alert(
              result.ok ? 'สำเร็จ' : 'ไม่สำเร็จ',
              result.message +
                (result.ok ? `\nยอด ฿${result.total.toLocaleString('th-TH')}` : ''),
            );
          }}
        >
          <Text style={styles.checkoutText}>Checkout</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filter, filter === f && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const itemVariants = variants.filter((v) => v.masterSkuId === item.id);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.tier}>{item.channel}</Text>
                <Text style={styles.sku}>{item.masterSku}</Text>
              </View>
              <Text style={styles.name}>{item.title}</Text>
              <Text style={styles.shop}>
                {item.shopName} · {item.brand}
              </Text>
              <Text style={styles.price}>เริ่ม ฿{item.basePrice.toLocaleString('th-TH')}</Text>

              <View style={styles.tags}>
                {item.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>

              {item.customFields.length ? (
                <Text style={styles.custom}>
                  Custom: {item.customFields.map((c) => `${c.key}=${c.value}`).join(' · ')}
                </Text>
              ) : null}

              {itemVariants.map((v) => {
                const rows = listStockRows(v.id);
                const avail = totalAvailable(v.id);
                return (
                  <View key={v.id} style={styles.variantRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.variantSku}>{v.sku}</Text>
                      <Text style={styles.variantMeta}>
                        {v.label} · ฿{v.price.toLocaleString('th-TH')} · คงเหลือ {avail}
                      </Text>
                      {rows.map((r) => {
                        const wh = warehouses.find((w) => w.id === r.warehouseId);
                        return (
                          <Text key={r.warehouseId} style={styles.wh}>
                            {wh?.name ?? r.warehouseId}: {r.onHand - r.reserved} (rev {r.revision})
                          </Text>
                        );
                      })}
                    </View>
                    <Pressable
                      style={styles.addBtn}
                      onPress={() => {
                        const preferred = (rows[0]?.warehouseId ??
                          'WH-CTI-MAIN') as WarehouseId;
                        const res = addToCart({
                          variantId: v.id,
                          warehouseId: preferred,
                          qty: v.moq ?? 1,
                          unitPrice: v.price,
                        });
                        Alert.alert(res.ok ? 'จองสต็อก' : 'ล้มเหลว', res.message);
                      }}
                    >
                      <Text style={styles.addText}>+ ตะกร้า</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.primary,
  },
  subtitle: {
    color: colors.text.secondary,
    marginBottom: 10,
    fontSize: 12,
  },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.brand.ink,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  cartText: { color: colors.brand.primary, fontWeight: '700', fontSize: 13 },
  checkoutBtn: {
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  checkoutText: { color: colors.brand.ink, fontWeight: '900' },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filter: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  filterActive: {
    backgroundColor: colors.brand.ink,
    borderColor: colors.brand.ink,
  },
  filterText: {
    fontWeight: '700',
    color: colors.text.secondary,
  },
  filterTextActive: {
    color: colors.brand.primary,
  },
  list: {
    paddingBottom: 120,
    gap: 10,
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tier: {
    color: colors.brand.primaryDark,
    fontWeight: '800',
    fontSize: 12,
  },
  sku: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
  shop: {
    color: colors.text.secondary,
    marginTop: 2,
  },
  price: {
    fontWeight: '900',
    color: colors.text.primary,
    marginTop: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tag: {
    backgroundColor: colors.brand.mist,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand.primaryDark,
  },
  custom: {
    marginTop: 8,
    color: colors.text.muted,
    fontSize: 11,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  variantSku: {
    fontWeight: '800',
    color: colors.text.primary,
    fontSize: 12,
  },
  variantMeta: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  wh: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: colors.brand.ink,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  addText: {
    color: colors.brand.primary,
    fontWeight: '800',
    fontSize: 12,
  },
});
