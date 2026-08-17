import React, { useMemo } from 'react';
import { Image, Platform, Pressable, StyleSheet, Switch, Text, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormTextInput } from '@/shared/components/FormTextInput';
import { colors } from '@/shared/theme/colors';
import type { SkuVariant } from '@/modules/commerce/domain/types';
import { variantDetailsFromAttrs } from '@/modules/commerce/domain/product-specs';

export type DraftVariant = {
  id: string;
  label: string;
  price: string;
  stock: string;
  imageUri: string | null;
  attrs?: SkuVariant['attrs'];
  size: string;
  weight: string;
  note: string;
};

export function newDraftVariant(seed?: Partial<DraftVariant>): DraftVariant {
  const details = variantDetailsFromAttrs(seed?.attrs);
  return {
    id: seed?.id ?? `dv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: seed?.label ?? '',
    price: seed?.price ?? '',
    stock: seed?.stock ?? '0',
    imageUri: seed?.imageUri ?? null,
    attrs: seed?.attrs,
    size: seed?.size ?? details.size,
    weight: seed?.weight ?? details.weight,
    note: seed?.note ?? details.note,
  };
}

export function sanitizeDecimal(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('').slice(0, 2)}` : head;
}

export function sanitizeInt(raw: string) {
  return raw.replace(/[^\d]/g, '');
}

type Props = {
  hasVariants: boolean;
  onToggle: (on: boolean) => void;
  variants: DraftVariant[];
  onPatch: (id: string, patch: Partial<DraftVariant>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onBumpVariant: (id: string, delta: 1 | -1) => void;
  onPickPhoto: (id: string) => void;
  simplePrice: string;
  simpleStock: string;
  onSimplePrice: (value: string) => void;
  onSimpleStock: (value: string) => void;
  onBumpSimple: (delta: 1 | -1) => void;
  editable?: boolean;
  simpleStockPlaceholder?: string;
};

export function VariantInventorySection({
  hasVariants,
  onToggle,
  variants,
  onPatch,
  onAdd,
  onRemove,
  onBumpVariant,
  onPickPhoto,
  simplePrice,
  simpleStock,
  onSimplePrice,
  onSimpleStock,
  onBumpSimple,
  editable = true,
  simpleStockPlaceholder = 'เช่น 10',
}: Props) {
  const prices = useMemo(
    () => variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n) && n > 0),
    [variants],
  );
  const stockTotal = useMemo(
    () =>
      variants.reduce((sum, v) => {
        const n = Number(v.stock);
        return sum + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0),
    [variants],
  );
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const rangeLabel =
    min == null || max == null
      ? null
      : min === max
        ? `${min.toLocaleString('th-TH')} บาท`
        : `${min.toLocaleString('th-TH')} - ${max.toLocaleString('th-TH')} บาท`;

  return (
    <View>
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>มีตัวเลือกย่อยสินค้าหรือไม่?</Text>
          <Text style={styles.toggleHint}>แต่ละตัวเลือกมีรูป ราคา สต็อก ขนาด และน้ำหนักของตัวเอง</Text>
        </View>
        <Switch
          value={hasVariants}
          onValueChange={onToggle}
          disabled={!editable}
          trackColor={{ false: '#D5DBD8', true: colors.brand.primary }}
          thumbColor="#fff"
        />
      </View>

      {hasVariants ? (
        <>
          {rangeLabel ? (
            <View style={styles.summary}>
              <Text style={styles.summaryText}>ช่วงราคา {rangeLabel}</Text>
              <Text style={styles.summaryText}>
                สต็อกรวม {stockTotal.toLocaleString('th-TH')} ชิ้น
              </Text>
            </View>
          ) : null}
          {variants.map((v, index) => {
            const stockN = Number(v.stock) || 0;
            return (
              <View key={v.id} style={styles.card}>
                <View style={styles.nameRow}>
                  <Text style={styles.miniLabel}>ชื่อตัวเลือก {index + 1}</Text>
                  <Pressable
                    onPress={() => {
                      if (!editable || variants.length <= 1) return;
                      Alert.alert('ลบตัวเลือกนี้?', 'ตัวเลือกย่อยจะถูกนำออก', [
                        { text: 'ยกเลิก', style: 'cancel' },
                        { text: 'ลบ', style: 'destructive', onPress: () => onRemove(v.id) },
                      ]);
                    }}
                    hitSlop={8}
                    disabled={!editable || variants.length <= 1}
                    accessibilityLabel="ลบตัวเลือกย่อย"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={variants.length <= 1 ? '#D5DBD8' : colors.text.muted}
                    />
                  </Pressable>
                </View>
                <View style={styles.photoRow}>
                  <Pressable
                    style={[styles.photoTile, !v.imageUri && styles.photoTileEmpty]}
                    onPress={() => onPickPhoto(v.id)}
                    disabled={!editable}
                    accessibilityLabel={v.imageUri ? 'เปลี่ยนรูปตัวเลือก' : 'เพิ่มรูปตัวเลือก'}
                  >
                    {v.imageUri ? (
                      <Image source={{ uri: v.imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={20} color={colors.text.secondary} />
                        <Text style={styles.photoHint}>รูป</Text>
                      </>
                    )}
                  </Pressable>
                  <FormTextInput
                    style={styles.nameInput}
                    value={v.label}
                    onChangeText={(t) => onPatch(v.id, { label: t })}
                    placeholder="เช่น 12 นิ้ว 3000W"
                    placeholderTextColor={colors.text.muted}
                    autoCapitalize="sentences"
                    editable={editable}
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                  />
                </View>
                <View style={styles.grid}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>ราคา (บาท)</Text>
                    <FormTextInput
                      style={styles.fieldInput}
                      value={v.price}
                      onChangeText={(t) => onPatch(v.id, { price: sanitizeDecimal(t) })}
                      keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                      inputMode="decimal"
                      placeholder="8500"
                      placeholderTextColor={colors.text.muted}
                      editable={editable}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>จำนวนชิ้น</Text>
                    <View style={styles.stepper}>
                      <Pressable
                        style={[styles.stockBtn, stockN <= 0 && styles.stockBtnDisabled]}
                        onPress={() => onBumpVariant(v.id, -1)}
                        disabled={!editable || stockN <= 0}
                      >
                        <Text style={styles.stockBtnText}>−</Text>
                      </Pressable>
                      <FormTextInput
                        style={styles.stockInput}
                        value={v.stock}
                        onChangeText={(t) => onPatch(v.id, { stock: sanitizeInt(t) })}
                        keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                        inputMode="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.text.muted}
                        textAlign="center"
                        editable={editable}
                      />
                      <Pressable
                        style={styles.stockBtn}
                        onPress={() => onBumpVariant(v.id, 1)}
                        disabled={!editable}
                      >
                        <Text style={styles.stockBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
                <View style={[styles.grid, { marginTop: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>ขนาด</Text>
                    <FormTextInput
                      style={styles.fieldInput}
                      value={v.size}
                      onChangeText={(t) => onPatch(v.id, { size: t })}
                      placeholder="เช่น 50.2cm × 33cm × 30.2cm"
                      placeholderTextColor={colors.text.muted}
                      autoCapitalize="sentences"
                      editable={editable}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>น้ำหนัก</Text>
                    <FormTextInput
                      style={styles.fieldInput}
                      value={v.weight}
                      onChangeText={(t) => onPatch(v.id, { weight: t })}
                      placeholder="เช่น 2.4 กก."
                      placeholderTextColor={colors.text.muted}
                      autoCapitalize="sentences"
                      editable={editable}
                    />
                  </View>
                </View>
                <Text style={[styles.miniLabel, { marginTop: 10 }]}>รายละเอียดสั้น (ไม่บังคับ)</Text>
                <FormTextInput
                  style={styles.fieldInput}
                  value={v.note}
                  onChangeText={(t) => onPatch(v.id, { note: t })}
                  placeholder="เช่น รวมสายไฟ / กล่องเดิม"
                  placeholderTextColor={colors.text.muted}
                  autoCapitalize="sentences"
                  editable={editable}
                />
              </View>
            );
          })}
          <Pressable
            style={[styles.addBtn, !editable && { opacity: 0.45 }]}
            onPress={onAdd}
            disabled={!editable}
          >
            <Ionicons name="add" size={18} color={colors.brand.primaryDark} />
            <Text style={styles.addText}>เพิ่มตัวเลือกย่อย</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.grid}>
          <View style={{ flex: 1 }}>
            <FormTextInput
              label="ราคา (บาท)"
              style={styles.fieldInput}
              value={simplePrice}
              onChangeText={(t) => onSimplePrice(sanitizeDecimal(t))}
              keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
              inputMode="decimal"
              placeholder="เช่น 8500"
              placeholderTextColor={colors.text.muted}
              editable={editable}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniLabel}>จำนวนชิ้น</Text>
            <View style={styles.stepper}>
              <Pressable
                style={[
                  styles.stockBtn,
                  (Number(simpleStock) || 0) <= 0 && styles.stockBtnDisabled,
                ]}
                onPress={() => onBumpSimple(-1)}
                disabled={!editable || (Number(simpleStock) || 0) <= 0}
              >
                <Text style={styles.stockBtnText}>−</Text>
              </Pressable>
              <FormTextInput
                style={styles.stockInput}
                value={simpleStock}
                onChangeText={(t) => onSimpleStock(sanitizeInt(t))}
                keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                inputMode="numeric"
                placeholder={simpleStockPlaceholder}
                placeholderTextColor={colors.text.muted}
                textAlign="center"
                editable={editable}
              />
              <Pressable
                style={styles.stockBtn}
                onPress={() => onBumpSimple(1)}
                disabled={!editable}
              >
                <Text style={styles.stockBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  toggleTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  toggleHint: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    lineHeight: 16,
  },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.brand.primaryDark,
    backgroundColor: colors.brand.mist,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  card: {
    backgroundColor: '#F7F8F7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    marginBottom: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  photoTile: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.brand.forest,
  },
  photoTileEmpty: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(10,22,17,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  photoHint: { fontSize: 10, fontWeight: '800', color: colors.text.secondary },
  miniLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  nameInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 15,
  },
  grid: { flexDirection: 'row', gap: 10 },
  fieldInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 15,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockBtn: {
    width: 36,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockBtnDisabled: { opacity: 0.35 },
  stockBtnText: { fontSize: 18, fontWeight: '700', color: colors.text.primary, marginTop: -1 },
  stockInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 15,
    minWidth: 48,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brand.primaryDark,
    paddingVertical: 12,
    marginTop: 2,
  },
  addText: { color: colors.brand.primaryDark, fontSize: 14, fontWeight: '800' },
});
