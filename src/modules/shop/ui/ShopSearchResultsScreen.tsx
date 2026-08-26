import React, { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { fromLegacyImages } from '@/modules/commerce/domain/product-media';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { ProductCardMediaCarousel } from './product/ProductCardMediaCarousel';

const CATEGORY_RULES = [
  { label: 'ล้อและยาง', pattern: /ล้อ|ยาง|rim|wheel|tire/ },
  { label: 'แบตเตอรี่', pattern: /แบต|battery|lifepo4|bms|pack/ },
  { label: 'อะไหล่และอุปกรณ์', pattern: /อะไหล่|parts|motor|controller|shock|brake|เบรก/ },
  { label: 'อิเล็กทรอนิกส์', pattern: /อิเล็กทรอนิกส์|electronics|charger|display|gps|converter/ },
  { label: 'รถและมอเตอร์ไซค์', pattern: /รถ|มอเตอร์ไซค์|motorcycle|scooter|ev/ },
];

function searchableText(master: ReturnType<typeof useInventoryStore.getState>['masters'][number], variantText = '') {
  return [
    master.title,
    master.masterSku,
    master.brand,
    master.shopName,
    master.categoryKey,
    master.tags.join(' '),
    variantText,
  ].join(' ').toLowerCase();
}

function detectCategoryLabel(query: string, productText: string) {
  const haystack = `${query} ${productText}`.toLowerCase();
  return CATEGORY_RULES.find((rule) => rule.pattern.test(haystack))?.label
    || query.trim()
    || 'สินค้าทั้งหมด';
}

export function ShopSearchResultsScreen({ query, label }: { query: string; label?: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const masters = useInventoryStore((state) => state.masters);
  const variants = useInventoryStore((state) => state.variants);
  const normalized = query.trim().toLowerCase();
  const cardWidth = (width - 32) / 2;

  const result = useMemo(() => {
    const shopProducts = masters.filter((master) => master.channel !== 'C2C');
    const textById = new Map(shopProducts.map((master) => {
      const variantText = variants
        .filter((variant) => variant.masterSkuId === master.id)
        .map((variant) => `${variant.sku} ${variant.label}`)
        .join(' ');
      return [master.id, searchableText(master, variantText)] as const;
    }));
    const exact = shopProducts.filter((master) => !normalized || textById.get(master.id)?.includes(normalized));
    const categoryLabel = detectCategoryLabel(normalized, exact.map((master) => textById.get(master.id)).join(' '));
    const categoryRule = CATEGORY_RULES.find((rule) => rule.label === categoryLabel);
    const exactIds = new Set(exact.map((master) => master.id));
    const related = categoryRule
      ? shopProducts.filter((master) => !exactIds.has(master.id) && categoryRule.pattern.test(textById.get(master.id) || ''))
      : [];
    return {
      categoryLabel,
      exactCount: exact.length,
      products: [
        ...exact.map((master) => ({ master, related: false })),
        ...related.map((master) => ({ master, related: true })),
      ],
    };
  }, [masters, normalized, variants]);

  return (
    <DragDownDismiss onDismiss={() => router.back()} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color="#171D19" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>สินค้า “{label || query || 'ทั้งหมด'}”</Text>
          <Text style={styles.count}>{result.products.length.toLocaleString('th-TH')} รายการ</Text>
        </View>
        <Pressable
          style={styles.search}
          onPress={() => router.replace({ pathname: '/channel-search', params: { scope: 'shop' } })}
          accessibilityRole="button"
          accessibilityLabel="ค้นหาสินค้าใหม่"
        >
          <Ionicons name="search" size={24} color="#171D19" />
        </Pressable>
      </View>

      <FlatList
        data={result.products}
        numColumns={2}
        keyExtractor={(item) => item.master.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }, result.products.length === 0 && styles.emptyList]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        ListHeaderComponent={(
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>คำที่ค้นหา</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>{label || query || 'ทั้งหมด'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>หมวดหมู่</Text>
              <View style={styles.categoryPill}>
                <Ionicons name="grid-outline" size={13} color="#36413B" />
                <Text style={styles.categoryPillText}>{result.categoryLabel}</Text>
              </View>
            </View>
            <Text style={styles.sectionTitle}>
              {result.exactCount > 0 ? 'สินค้าที่ตรงกับคำค้นหา' : 'สินค้าใกล้เคียงในหมวดเดียวกัน'}
            </Text>
          </View>
        )}
        renderItem={({ item: rowItem }) => {
          const item = rowItem.master;
          const media = item.media?.length
            ? item.media
            : fromLegacyImages(item.imageUris, item.imageUri ?? masterContentImage(item.id));
          return (
            <Pressable
              style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
              onPress={() => router.push({ pathname: '/shop/product/[id]', params: { id: item.id } })}
            >
              <ProductCardMediaCarousel
                media={media}
                size={cardWidth}
                aspect="square"
                onPress={() => router.push({ pathname: '/shop/product/[id]', params: { id: item.id } })}
              />
              <View style={styles.cardBody}>
                {rowItem.related ? <Text style={styles.relatedBadge}>สินค้าใกล้เคียง</Text> : null}
                <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.shopName} numberOfLines={1}>{item.shopName}</Text>
                <Text style={styles.price}>฿{item.basePrice.toLocaleString('th-TH')}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="bag-handle-outline" size={42} color="#9CA49F" />
            <Text style={styles.emptyTitle}>ยังไม่มีสินค้าในหมวดนี้</Text>
            <Text style={styles.emptyText}>ลองกลับไปค้นหาด้วยชื่อสินค้า แบรนด์ หรือคีย์เวิร์ดอื่น</Text>
          </View>
        )}
      />
    </DragDownDismiss>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F4F2' },
  header: { minHeight: 94, paddingHorizontal: 10, paddingBottom: 11, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE2DE' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0, paddingBottom: 4 },
  title: { color: '#171D19', fontSize: 17, fontWeight: '900' },
  count: { color: '#7B8580', fontSize: 11, marginTop: 2 },
  search: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 12, paddingTop: 12 },
  emptyList: { flexGrow: 1 },
  row: { gap: 8 },
  summary: { marginBottom: 12, padding: 14, borderRadius: 17, backgroundColor: '#FFFFFF', gap: 9 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryLabel: { color: '#7B8580', fontSize: 12, fontWeight: '700' },
  summaryValue: { flex: 1, color: '#202824', fontSize: 13, fontWeight: '900', textAlign: 'right' },
  categoryPill: { minHeight: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: '#E8ECE9', flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryPillText: { color: '#36413B', fontSize: 12, fontWeight: '900' },
  sectionTitle: { color: '#202824', fontSize: 15, fontWeight: '900', marginTop: 5 },
  card: { marginBottom: 9, borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  cardPressed: { opacity: 0.72 },
  cardBody: { padding: 10 },
  relatedBadge: { alignSelf: 'flex-start', color: '#68726C', backgroundColor: '#EEF1EF', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, fontSize: 9, fontWeight: '800', marginBottom: 5 },
  productTitle: { minHeight: 38, color: '#202824', fontSize: 14, lineHeight: 19, fontWeight: '800' },
  shopName: { color: '#808984', fontSize: 10, marginTop: 4 },
  price: { color: '#E7354F', fontSize: 17, fontWeight: '900', marginTop: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 100 },
  emptyTitle: { color: '#303833', fontSize: 18, fontWeight: '900', marginTop: 12 },
  emptyText: { color: '#818A85', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
});
