import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import {
  MediaGalleryPicker,
  type PickedGalleryItem,
} from '@/shared/media/MediaGalleryPicker';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useCategoriesStore } from '@/modules/store/state/categories-store';
import { MY_SHOP_ID } from '@/modules/warehouse/state/warehouse-store';
import type { CustomFieldValue } from '@/modules/commerce/domain/types';
import { colors } from '@/shared/theme/colors';

const MAX_PRODUCT_IMAGES = 6;
const STOCK_QUICK = [-5, -1, 1, 5] as const;

type FieldErrors = Partial<
  Record<'title' | 'sku' | 'barcode' | 'price' | 'cost' | 'stock', string>
>;

function parseNonNegNumber(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseNonNegInt(raw: string): number | null {
  const n = parseNonNegNumber(raw);
  if (n == null || !Number.isInteger(n)) return null;
  return n;
}

export function ProductEditScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { id: idParam } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const customFieldDefs = useInventoryStore((s) => s.customFieldDefs);
  const totalAvailable = useInventoryStore((s) => s.totalAvailable);
  const updateProduct = useInventoryStore((s) => s.updateProduct);
  const deleteProduct = useInventoryStore((s) => s.deleteProduct);
  const categories = useCategoriesStore((s) => s.categories);

  const master = useMemo(() => masters.find((m) => m.id === id), [masters, id]);
  const productVariants = useMemo(
    () => variants.filter((v) => v.masterSkuId === id),
    [variants, id],
  );

  const availableTotal = useMemo(() => {
    if (!id) return 0;
    return productVariants.reduce((sum, v) => sum + totalAvailable(v.id), 0);
  }, [id, productVariants, totalAvailable]);

  const primaryVariant = productVariants[0];
  const avgCost = useMemo(() => {
    const costs = productVariants.map((v) => v.cost).filter((c): c is number => c != null);
    if (!costs.length) return 0;
    return Math.round(costs.reduce((a, b) => a + b, 0) / costs.length);
  }, [productVariants]);

  const [title, setTitle] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryKey, setCategoryKey] = useState('');
  const [description, setDescription] = useState('');
  const [priceText, setPriceText] = useState('');
  const [costText, setCostText] = useState('');
  const [stockText, setStockText] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string>('');
  const allowLeaveRef = useRef(false);
  const hydrateKey = useRef<string | null>(null);

  useEffect(() => {
    if (!master) return;
    if (hydrateKey.current === master.id && baseline) return;
    hydrateKey.current = master.id;

    const prices = productVariants.map((v) => v.price);
    const minPrice = prices.length ? Math.min(...prices) : master.basePrice;
    const nextTitle = master.title;
    const nextSku = master.masterSku;
    const nextBarcode = master.barcode ?? '';
    const nextCategory = master.categoryKey ?? '';
    const nextDesc = master.description ?? '';
    const nextPrice = String(minPrice);
    const nextCost = String(avgCost);
    const nextStock = String(availableTotal);
    const nextImages = master.imageUris?.length
      ? [...master.imageUris]
      : master.imageUri
        ? [master.imageUri]
        : [];
    const nextFields = Object.fromEntries(
      master.customFields.map((f) => [f.key, String(f.value)]),
    );

    setTitle(nextTitle);
    setSku(nextSku);
    setBarcode(nextBarcode);
    setCategoryKey(nextCategory);
    setDescription(nextDesc);
    setPriceText(nextPrice);
    setCostText(nextCost);
    setStockText(nextStock);
    setImageUris(nextImages);
    setFieldValues(nextFields);
    setErrors({});
    setBaseline(
      JSON.stringify({
        title: nextTitle,
        sku: nextSku,
        barcode: nextBarcode,
        categoryKey: nextCategory,
        description: nextDesc,
        priceText: nextPrice,
        costText: nextCost,
        stockText: nextStock,
        imageUris: nextImages,
        fieldValues: nextFields,
      }),
    );
  }, [master, productVariants, availableTotal, avgCost, baseline]);

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        title,
        sku,
        barcode,
        categoryKey,
        description,
        priceText,
        costText,
        stockText,
        imageUris,
        fieldValues,
      }),
    [
      title,
      sku,
      barcode,
      categoryKey,
      description,
      priceText,
      costText,
      stockText,
      imageUris,
      fieldValues,
    ],
  );

  const isDirty = Boolean(baseline) && currentSnapshot !== baseline;

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const confirmLeave = useCallback(
    (onLeave: () => void) => {
      if (!isDirty || allowLeaveRef.current) {
        onLeave();
        return;
      }
      Alert.alert('มีการแก้ไขที่ยังไม่บันทึก', 'ต้องการออกโดยไม่บันทึกหรือไม่?', [
        { text: 'อยู่ต่อ', style: 'cancel' },
        {
          text: 'ออกโดยไม่บันทึก',
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            onLeave();
          },
        },
      ]);
    },
    [isDirty],
  );

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!isDirty || allowLeaveRef.current) return;
      e.preventDefault();
      Alert.alert('มีการแก้ไขที่ยังไม่บันทึก', 'ต้องการออกโดยไม่บันทึกหรือไม่?', [
        { text: 'อยู่ต่อ', style: 'cancel' },
        {
          text: 'ออกโดยไม่บันทึก',
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsub;
  }, [navigation, isDirty]);

  const goBackToInventory = useCallback(() => {
    allowLeaveRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/store/dashboard');
  }, []);

  const setStockFromNumber = (n: number) => {
    const next = Math.max(0, Math.floor(n));
    setStockText(String(next));
    setErrors((prev) => ({ ...prev, stock: undefined }));
  };

  const adjustStock = (delta: number) => {
    const current = parseNonNegInt(stockText) ?? 0;
    setStockFromNumber(current + delta);
    void Haptics.selectionAsync();
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= imageUris.length) return;
    setImageUris((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    void Haptics.selectionAsync();
  };

  const openAddGallery = () => {
    setReplaceIndex(null);
    setGalleryOpen(true);
  };

  const openReplaceGallery = (index: number) => {
    setReplaceIndex(index);
    setGalleryOpen(true);
  };

  const closeGallery = () => {
    setGalleryOpen(false);
    setReplaceIndex(null);
  };

  const removeImageAt = (index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  const onGallerySend = (items: PickedGalleryItem[]) => {
    const photos = items.filter((i) => i.mediaType === 'photo').map((i) => i.uri);
    const at = replaceIndex;
    closeGallery();
    if (!photos.length) return;

    setImageUris((prev) => {
      if (at != null) {
        const next = [...prev];
        next[at] = photos[0]!;
        return [...next, ...photos.slice(1)].slice(0, MAX_PRODUCT_IMAGES);
      }
      return [...prev, ...photos].slice(0, MAX_PRODUCT_IMAGES);
    });
    void Haptics.selectionAsync();
  };

  const openBarcodeScanner = () => {
    setScannerOpen(true);
  };

  const applyScannedBarcode = (code: string) => {
    setScannerOpen(false);
    setBarcode(code);
    setErrors((prev) => ({ ...prev, barcode: undefined }));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('อ่านบาร์โค้ดแล้ว');
  };

  const validateClient = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = 'กรุณาใส่ชื่อสินค้า';
    if (!sku.trim()) next.sku = 'กรุณาใส่ SKU';
    const price = parseNonNegNumber(priceText);
    if (price == null) next.price = 'ราคาต้องเป็นตัวเลข 0 ขึ้นไป';
    const cost = parseNonNegNumber(costText);
    if (costText.trim() && cost == null) next.cost = 'ต้นทุนต้องเป็นตัวเลข 0 ขึ้นไป';
    const stock = parseNonNegInt(stockText);
    if (stock == null) next.stock = 'สต็อกต้องเป็นจำนวนเต็มไม่ติดลบ';
    return next;
  };

  const handleSubmit = () => {
    if (!master || saving) return;

    if (!isMine) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast('สินค้า Shared Listing — แก้ไขที่คลังต้นทางเท่านั้น');
      Alert.alert('แก้ไขไม่ได้', 'สินค้า Shared Listing แก้ไขที่คลังต้นทางเท่านั้น');
      return;
    }

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const first = Object.values(clientErrors)[0];
      showToast(first ?? 'กรุณาตรวจฟิลด์ที่จำเป็น');
      return;
    }

    const price = parseNonNegNumber(priceText)!;
    const cost = costText.trim() ? parseNonNegNumber(costText)! : 0;
    const stock = parseNonNegInt(stockText)!;

    const customFields: CustomFieldValue[] = customFieldDefs
      .map((def) => {
        const raw = fieldValues[def.key];
        if (raw == null || raw === '') return null;
        return {
          key: def.key,
          value: def.type === 'number' ? Number(raw) : raw,
        };
      })
      .filter(Boolean) as CustomFieldValue[];

    setSaving(true);
    const result = updateProduct(master.id, {
      title: title.trim(),
      masterSku: sku.trim(),
      barcode: barcode.trim() || null,
      categoryKey: categoryKey || undefined,
      description,
      price,
      cost,
      availableTotal: stock,
      imageUris,
      customFields,
    });
    setSaving(false);

    if (!result.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (result.field) {
        setErrors((prev) => ({ ...prev, [result.field!]: result.reason }));
      }
      showToast(result.reason);
      Alert.alert('บันทึกไม่สำเร็จ', result.reason);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('บันทึกสินค้าเรียบร้อย');
    allowLeaveRef.current = true;
    setBaseline(currentSnapshot);
    setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/store/dashboard');
    }, 350);
  };

  const handleCancel = () => {
    confirmLeave(goBackToInventory);
  };

  const handleDelete = () => {
    if (!master) return;
    if (!isMine) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast('ลบได้เฉพาะสินค้าของร้านคุณ');
      Alert.alert('ลบไม่ได้', 'สินค้า Shared Listing ลบที่คลังต้นทางเท่านั้น');
      return;
    }
    Alert.alert('ลบสินค้า', `ต้องการลบ "${master.title}" ใช่ไหม? การกระทำนี้ย้อนกลับไม่ได้`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบสินค้า',
        style: 'destructive',
        onPress: () => {
          const result = deleteProduct(master.id);
          if (!result.ok) {
            Alert.alert('ลบไม่สำเร็จ', result.reason);
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          allowLeaveRef.current = true;
          showToast('ลบสินค้าแล้ว');
          setTimeout(goBackToInventory, 250);
        },
      },
    ]);
  };

  if (!master) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16, alignItems: 'center' }]}>
        <Text style={styles.topTitle}>ไม่พบสินค้า</Text>
        <Pressable style={styles.ghostBtn} onPress={goBackToInventory}>
          <Text style={styles.ghostBtnText}>กลับคลังสินค้า</Text>
        </Pressable>
      </View>
    );
  }

  const isMine = !master.ownerShopId || master.ownerShopId === MY_SHOP_ID;
  const visibleCategories = categories.filter((c) => !c.hidden);
  const remainingSlots = Math.max(0, MAX_PRODUCT_IMAGES - imageUris.length);
  const galleryLimit =
    replaceIndex != null
      ? Math.max(1, remainingSlots + 1)
      : Math.max(1, remainingSlots);
  const coverPreviewUri =
    imageUris[0] ?? master.imageUri ?? master.imageUris?.[0] ?? masterContentImage(master.id);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} onPress={handleCancel} accessibilityLabel="ย้อนกลับ">
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={styles.topTitles}>
          <Text style={styles.topTitle}>แก้ไขสินค้า</Text>
          <Text style={styles.topSub} numberOfLines={1}>
            {master.title}
          </Text>
        </View>
        {isDirty ? (
          <View style={styles.dirtyPill}>
            <Text style={styles.dirtyPillText}>ยังไม่บันทึก</Text>
          </View>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.sectionLabel}>
          รูปสินค้า ({imageUris.length}/{MAX_PRODUCT_IMAGES}) · รูปแรก = รูปปก · ลากเรียงด้วยปุ่มลูกศร
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
        >
          {imageUris.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.photoTile}>
              <Pressable onPress={() => openReplaceGallery(index)} style={StyleSheet.absoluteFill}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              </Pressable>
              {index === 0 ? (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>ปก</Text>
                </View>
              ) : null}
              <View style={styles.reorderRow}>
                <Pressable
                  style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]}
                  onPress={() => moveImage(index, -1)}
                  disabled={index === 0}
                >
                  <Ionicons name="chevron-back" size={14} color="#fff" />
                </Pressable>
                <Pressable
                  style={[
                    styles.reorderBtn,
                    index === imageUris.length - 1 && styles.reorderBtnDisabled,
                  ]}
                  onPress={() => moveImage(index, 1)}
                  disabled={index === imageUris.length - 1}
                >
                  <Ionicons name="chevron-forward" size={14} color="#fff" />
                </Pressable>
              </View>
              <Pressable
                style={styles.removePhoto}
                onPress={() => removeImageAt(index)}
                hitSlop={8}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
          {imageUris.length === 0 ? (
            <View style={styles.photoTile}>
              <Image
                source={{ uri: coverPreviewUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              <View style={styles.coverBadge}>
                <Text style={styles.coverBadgeText}>ปกปัจจุบัน</Text>
              </View>
            </View>
          ) : null}
          {remainingSlots > 0 ? (
            <Pressable style={styles.addPhotoTile} onPress={openAddGallery}>
              <Ionicons name="camera" size={22} color={colors.text.secondary} />
              <Text style={styles.addPhotoText}>เพิ่ม/อัปโหลด</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <FieldLabel>ชื่อสินค้า</FieldLabel>
        <TextInput
          style={[styles.input, errors.title && styles.inputError]}
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (errors.title) setErrors((p) => ({ ...p, title: undefined }));
          }}
          placeholder="เช่น LiFePO4 12.8V"
          placeholderTextColor={colors.text.muted}
          editable={isMine}
        />
        {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}

        <FieldLabel>SKU</FieldLabel>
        <TextInput
          style={[styles.input, errors.sku && styles.inputError]}
          value={sku}
          onChangeText={(v) => {
            setSku(v);
            if (errors.sku) setErrors((p) => ({ ...p, sku: undefined }));
          }}
          placeholder="เช่น BEV-BAT-001"
          placeholderTextColor={colors.text.muted}
          autoCapitalize="characters"
          editable={isMine}
        />
        {errors.sku ? <Text style={styles.errorText}>{errors.sku}</Text> : null}

        <FieldLabel>บาร์โค้ด</FieldLabel>
        <View style={styles.rowInput}>
          <TextInput
            style={[styles.input, styles.inputFlex, errors.barcode && styles.inputError]}
            value={barcode}
            onChangeText={(v) => {
              setBarcode(v);
              if (errors.barcode) setErrors((p) => ({ ...p, barcode: undefined }));
            }}
            placeholder="EAN / UPC / รหัสสินค้า"
            placeholderTextColor={colors.text.muted}
            editable={isMine}
          />
          <Pressable
            style={styles.scanBtn}
            onPress={openBarcodeScanner}
            accessibilityLabel="สแกนบาร์โค้ด"
          >
            <Ionicons name="barcode-outline" size={22} color="#fff" />
          </Pressable>
        </View>
        {errors.barcode ? <Text style={styles.errorText}>{errors.barcode}</Text> : null}

        <FieldLabel>หมวดหมู่</FieldLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {visibleCategories.map((c) => {
            const active = categoryKey === c.key;
            return (
              <Pressable
                key={c.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  if (!isMine) return;
                  setCategoryKey(active ? '' : c.key);
                  void Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <FieldLabel>ราคาขาย (บาท)</FieldLabel>
        <TextInput
          style={[styles.input, errors.price && styles.inputError]}
          value={priceText}
          onChangeText={(v) => {
            setPriceText(v);
            if (errors.price) setErrors((p) => ({ ...p, price: undefined }));
          }}
          placeholder="0"
          placeholderTextColor={colors.text.muted}
          keyboardType="decimal-pad"
          editable={isMine}
        />
        {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}
        {productVariants.length > 1 ? (
          <Text style={styles.hint}>มี {productVariants.length} รุ่น — ราคาที่บันทึกจะใช้กับทุกรุ่น</Text>
        ) : null}

        <FieldLabel>ต้นทุน (บาท)</FieldLabel>
        <TextInput
          style={[styles.input, errors.cost && styles.inputError]}
          value={costText}
          onChangeText={(v) => {
            setCostText(v);
            if (errors.cost) setErrors((p) => ({ ...p, cost: undefined }));
          }}
          placeholder="0"
          placeholderTextColor={colors.text.muted}
          keyboardType="decimal-pad"
          editable={isMine}
        />
        {errors.cost ? <Text style={styles.errorText}>{errors.cost}</Text> : null}

        <FieldLabel>สต็อก (ขายได้)</FieldLabel>
        <TextInput
          style={[styles.input, errors.stock && styles.inputError]}
          value={stockText}
          onChangeText={(v) => {
            setStockText(v);
            if (errors.stock) setErrors((p) => ({ ...p, stock: undefined }));
          }}
          placeholder="0"
          placeholderTextColor={colors.text.muted}
          keyboardType="number-pad"
          editable={isMine}
        />
        {errors.stock ? <Text style={styles.errorText}>{errors.stock}</Text> : null}
        <View style={styles.quickRow}>
          {STOCK_QUICK.map((delta) => (
            <Pressable
              key={delta}
              style={styles.quickBtn}
              onPress={() => adjustStock(delta)}
              disabled={!isMine}
            >
              <Text style={styles.quickBtnText}>
                {delta > 0 ? `+${delta}` : String(delta)}
              </Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel>รายละเอียด / สเปก</FieldLabel>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="สเปก สภาพ ประกัน ฯลฯ"
          placeholderTextColor={colors.text.muted}
          multiline
          textAlignVertical="top"
          editable={isMine}
        />

        {customFieldDefs.length ? (
          <>
            <FieldLabel>สเปกเพิ่มเติม</FieldLabel>
            {customFieldDefs.map((def) => (
              <View key={def.key} style={{ marginBottom: 10 }}>
                <Text style={styles.miniLabel}>{def.label}</Text>
                <TextInput
                  style={styles.input}
                  value={fieldValues[def.key] ?? ''}
                  onChangeText={(v) => setFieldValues((prev) => ({ ...prev, [def.key]: v }))}
                  placeholder={def.type === 'number' ? '0' : def.label}
                  placeholderTextColor={colors.text.muted}
                  keyboardType={def.type === 'number' ? 'decimal-pad' : 'default'}
                  editable={isMine}
                />
              </View>
            ))}
          </>
        ) : null}

        {primaryVariant ? (
          <Text style={styles.metaFoot}>
            รุ่นหลัก · {primaryVariant.label} · SKU {primaryVariant.sku}
          </Text>
        ) : null}

        {!isMine ? (
          <Text style={styles.sharedNote}>
            สินค้า Shared Listing — แก้ไขได้เฉพาะที่คลังต้นทาง
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          style={styles.dangerBtn}
          onPress={handleDelete}
          disabled={saving}
          accessibilityLabel="ลบสินค้า"
        >
          <Ionicons name="trash-outline" size={18} color="#DC2626" />
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={handleCancel} disabled={saving}>
          <Text style={styles.cancelBtnText}>ยกเลิก</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.75 }]}
          onPress={handleSubmit}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="บันทึก"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>บันทึก</Text>
          )}
        </Pressable>
      </View>

      {toast ? (
        <View style={[styles.toast, { bottom: 88 + insets.bottom }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <MediaGalleryPicker
        visible={galleryOpen}
        onClose={closeGallery}
        onSend={onGallerySend}
        initialMode="photo"
        allowModeSwitch={false}
        selectionLimit={galleryLimit}
        sendLabel="ส่ง"
        title="ล่าสุด"
      />

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={applyScannedBarcode}
      />
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function BarcodeScannerModal({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!visible) setManual('');
  }, [visible]);

  const simulateCameraScan = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('ต้องการกล้อง', 'เปิดสิทธิ์กล้องเพื่อสแกนบาร์โค้ด');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const stamp = `${Date.now()}`.slice(-8);
    onScanned(`885${stamp}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scannerRoot}>
        <Pressable style={styles.scannerBackdrop} onPress={onClose} />
        <View style={[styles.scannerSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.scannerTitle}>สแกนบาร์โค้ด</Text>
          <Text style={styles.scannerSub}>ใช้กล้องหรือพิมพ์รหัสด้วยตนเอง</Text>

          <Pressable style={styles.scannerPrimary} onPress={() => void simulateCameraScan()}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.scannerPrimaryText}>เปิดกล้องสแกน</Text>
          </Pressable>

          <Text style={styles.miniLabel}>หรือพิมพ์รหัส</Text>
          <TextInput
            style={styles.input}
            value={manual}
            onChangeText={setManual}
            placeholder="เช่น 8850123456789"
            placeholderTextColor={colors.text.muted}
            keyboardType="number-pad"
            autoFocus
          />
          <Pressable
            style={[styles.saveBtn, { marginTop: 4 }]}
            onPress={() => {
              const code = manual.trim();
              if (!code) {
                Alert.alert('ยังไม่มีรหัส', 'พิมพ์บาร์โค้ดหรือใช้กล้องสแกน');
                return;
              }
              onScanned(code);
            }}
          >
            <Text style={styles.saveBtnText}>ใช้รหัสนี้</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: colors.surface.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  topTitles: { flex: 1 },
  topTitle: { fontSize: 18, fontWeight: '900', color: colors.text.primary },
  topSub: { fontSize: 12, color: colors.text.secondary, marginTop: 2, fontWeight: '600' },
  dirtyPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dirtyPillText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  scroll: { flex: 1, paddingHorizontal: 14 },
  sectionLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  photoStrip: { gap: 10, paddingBottom: 6 },
  photoTile: {
    width: 104,
    height: 104,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0B3D2E',
  },
  coverBadge: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  coverBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  reorderRow: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reorderBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnDisabled: { opacity: 0.35 },
  removePhoto: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoTile: {
    width: 104,
    height: 104,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D5DBD8',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#fff',
  },
  addPhotoText: { fontSize: 11, fontWeight: '700', color: colors.text.secondary },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  miniLabel: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5DBD8',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  inputFlex: { flex: 1, marginBottom: 0 },
  inputError: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  textArea: { minHeight: 96, paddingTop: 12 },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  rowInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D5DBD8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: colors.brand.mist,
    borderColor: colors.brand.primaryDark,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  chipTextActive: { color: colors.brand.primaryDark },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF2F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtnText: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  metaFoot: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '600',
  },
  sharedNote: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  dangerBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DBD8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    left: 24,
    right: 24,
    backgroundColor: colors.brand.forest,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toastText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  ghostBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.brand.mist,
  },
  ghostBtnText: { fontWeight: '800', color: colors.brand.primaryDark },
  scannerRoot: { flex: 1, justifyContent: 'flex-end' },
  scannerBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  scannerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 10,
  },
  scannerTitle: { fontSize: 18, fontWeight: '900', color: colors.text.primary },
  scannerSub: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
    marginBottom: 14,
    fontWeight: '600',
  },
  scannerPrimary: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  scannerPrimaryText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
