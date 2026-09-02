import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';
import { searchOwnCatalog } from '@/modules/commerce/data/commerceApi';

/** สินค้าที่เลือกปักไว้กับโพสต์ — เก็บแค่ id, ราคา/สต็อกอ่านสดตอนแสดงผล */
export type TaggedProduct = {
  productId: string;
  title: string;
  priceThb: number;
  shopName: string;
};

const MAX_TAGS = 10;

export function ProductTagPicker({
  value,
  onChange,
}: {
  value: TaggedProduct[];
  onChange: (next: TaggedProduct[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const remove = useCallback(
    (productId: string) => {
      const target = value.find((item) => item.productId === productId);
      // กฎเหล็ก: การเอาออกต้องถามก่อนเสมอ
      Alert.alert('เอาสินค้าออก', `เอา “${target?.title ?? 'สินค้านี้'}” ออกจากโพสต์?`, [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'เอาออก',
          style: 'destructive',
          onPress: () => onChange(value.filter((item) => item.productId !== productId)),
        },
      ]);
    },
    [onChange, value],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="pricetag-outline" size={18} color={colors.text.primary} />
          <Text style={styles.headerText}>ปักตะกร้าสินค้า</Text>
        </View>
        <Pressable
          onPress={() => setOpen(true)}
          style={styles.addBtn}
          accessibilityRole="button"
          accessibilityLabel="เลือกสินค้ามาปักกับโพสต์"
        >
          <Text style={styles.addText}>{value.length ? 'เพิ่ม' : 'เลือกสินค้า'}</Text>
        </Pressable>
      </View>

      {value.length ? (
        <View style={styles.chips}>
          {value.map((item) => (
            <View key={item.productId} style={styles.chip}>
              <Text style={styles.chipTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.chipPrice}>฿{item.priceThb.toLocaleString('th-TH')}</Text>
              <Pressable
                onPress={() => remove(item.productId)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`เอา ${item.title} ออก`}
              >
                <Ionicons name="close" size={16} color={colors.text.secondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>
          ปักสินค้าจากร้านของคุณ คนดูแตะแล้วไปหน้าสินค้าได้ทันที
        </Text>
      )}

      <ProductSearchSheet
        visible={open}
        onClose={() => setOpen(false)}
        selected={value}
        onPick={(product) => {
          if (value.some((item) => item.productId === product.productId)) return;
          if (value.length >= MAX_TAGS) {
            Alert.alert('ปักได้สูงสุด 10 ชิ้น', 'เอาสินค้าบางชิ้นออกก่อนถ้าต้องการเพิ่ม');
            return;
          }
          onChange([...value, product]);
          setOpen(false);
        }}
      />
    </View>
  );
}

function ProductSearchSheet({
  visible,
  onClose,
  onPick,
  selected,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (product: TaggedProduct) => void;
  selected: TaggedProduct[];
}) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<TaggedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedIds = useMemo(() => new Set(selected.map((item) => item.productId)), [selected]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // พิมพ์แล้วรอ 300ms ค่อยยิง — กันยิงทุกตัวอักษร
    const timer = setTimeout(async () => {
      try {
        const res = await searchOwnCatalog(query);
        if (cancelled) return;
        setRows(
          (res.data ?? []).map((bundle) => ({
            productId: String(bundle.product.id ?? ''),
            title: String(bundle.product.title || bundle.product.masterSku || 'สินค้า'),
            priceThb: Number(bundle.product.basePrice ?? 0) || 0,
            shopName: String(bundle.product.shopName ?? ''),
          })).filter((row) => row.productId),
        );
      } catch {
        if (!cancelled) setError('โหลดรายการสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>เลือกสินค้าของคุณ</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="ปิด">
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="พิมพ์ชื่อสินค้าหรือรหัส SKU"
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        {loading ? (
          <ActivityIndicator style={styles.center} color={colors.brand.primaryDark} />
        ) : error ? (
          <Text style={styles.empty}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>
            {query ? 'ไม่พบสินค้าที่ตรงกับคำค้น' : 'ร้านของคุณยังไม่มีสินค้า เพิ่มสินค้าในคลังก่อน'}
          </Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.productId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const already = selectedIds.has(item.productId);
              return (
                <Pressable
                  style={[styles.row, already && styles.rowPicked]}
                  onPress={() => onPick(item)}
                  disabled={already}
                  accessibilityRole="button"
                  accessibilityLabel={`ปัก ${item.title}`}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.shopName || 'ร้านของคุณ'} · ฿{item.priceThb.toLocaleString('th-TH')}
                    </Text>
                  </View>
                  <Ionicons
                    name={already ? 'checkmark-circle' : 'add-circle-outline'}
                    size={22}
                    color={already ? colors.brand.primaryDark : colors.text.secondary}
                  />
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  addBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: colors.brand.mist,
  },
  addText: { color: colors.brand.primaryDark, fontWeight: '700', fontSize: 13.5 },
  hint: { color: colors.text.muted, fontSize: 13 },
  chips: { gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.surface.card, borderWidth: 1, borderColor: colors.border.soft,
  },
  chipTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text.primary },
  chipPrice: { fontSize: 13.5, fontWeight: '700', color: colors.brand.primaryDark },

  sheet: { flex: 1, backgroundColor: colors.surface.canvas, padding: 18, gap: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface.card, borderRadius: 12, paddingHorizontal: 12, height: 44,
    borderWidth: 1, borderColor: colors.border.soft,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text.primary },
  center: { marginTop: 32 },
  empty: { marginTop: 28, textAlign: 'center', color: colors.text.muted, fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: colors.surface.card, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border.soft,
  },
  rowPicked: { opacity: 0.55 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  rowSub: { fontSize: 12.5, color: colors.text.secondary },
});
