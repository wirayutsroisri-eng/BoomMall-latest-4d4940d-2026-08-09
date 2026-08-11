import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { MasterSku, SkuVariant } from '@/modules/commerce/domain/types';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { colors } from '@/shared/theme/colors';

const SCREEN_H = Dimensions.get('window').height;
const SHEET_H = Math.round(SCREEN_H * 0.58);

type Props = {
  visible: boolean;
  product: MasterSku | null;
  variants: SkuVariant[];
  availableTotal: number;
  onClose: () => void;
  onSaved?: () => void;
};

export function ProductQuickEditSheet({
  visible,
  product,
  variants,
  availableTotal,
  onClose,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const quickUpdateProduct = useInventoryStore((s) => s.quickUpdateProduct);

  const [title, setTitle] = useState('');
  const [priceText, setPriceText] = useState('');
  const [stockText, setStockText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !product) return;
    const prices = variants.map((v) => v.price);
    const minPrice = prices.length ? Math.min(...prices) : product.basePrice;
    const maxPrice = prices.length ? Math.max(...prices) : product.basePrice;
    setTitle(product.title);
    setPriceText(String(minPrice === maxPrice ? minPrice : minPrice));
    setStockText(String(availableTotal));
    setSaving(false);
  }, [visible, product, variants, availableTotal]);

  const onSave = () => {
    if (!product || saving) return;
    const price = Number(String(priceText).replace(/,/g, '').trim());
    const stock = Number(String(stockText).replace(/,/g, '').trim());
    if (!title.trim()) {
      Alert.alert('บันทึกไม่ได้', 'กรุณาใส่ชื่อสินค้า');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('บันทึกไม่ได้', 'ราคาไม่ถูกต้อง');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
      Alert.alert('บันทึกไม่ได้', 'จำนวนสต็อกต้องเป็นจำนวนเต็มไม่ติดลบ');
      return;
    }

    setSaving(true);
    const result = quickUpdateProduct(product.id, {
      title: title.trim(),
      price,
      availableTotal: stock,
    });
    setSaving(false);

    if (!result.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('บันทึกไม่สำเร็จ', result.reason);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved?.();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="ปิด" />
        <View
          style={[styles.sheet, { height: SHEET_H, paddingBottom: Math.max(insets.bottom, 12) }]}
          pointerEvents="box-none"
        >
          <View style={styles.sheetInner} pointerEvents="auto">
          <View style={styles.handle} />
          <Text style={styles.heading}>แก้ไขด่วน</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {product?.title ?? 'สินค้า'}
          </Text>

          <Text style={styles.label}>ชื่อสินค้า</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="ชื่อสินค้า"
            placeholderTextColor="#9AA3A0"
            autoCorrect={false}
          />

          <Text style={styles.label}>
            ราคาขาย {variants.length > 1 ? '(ใช้กับทุกรุ่น)' : ''}
          </Text>
          <TextInput
            style={styles.input}
            value={priceText}
            onChangeText={setPriceText}
            placeholder="0"
            placeholderTextColor="#9AA3A0"
            keyboardType="number-pad"
          />

          <Text style={styles.label}>จำนวนสต็อก (ขายได้รวม)</Text>
          <TextInput
            style={styles.input}
            value={stockText}
            onChangeText={setStockText}
            placeholder="0"
            placeholderTextColor="#9AA3A0"
            keyboardType="number-pad"
          />

          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.secondaryBtnText}>ยกเลิก</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, saving && { opacity: 0.7 }]}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>บันทึกข้อมูล</Text>
              )}
            </Pressable>
          </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 2,
    elevation: 8,
  },
  sheetInner: {
    flex: 1,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 10,
  },
  heading: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
  },
  sub: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 14,
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5DBD8',
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 0.42,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DBD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
