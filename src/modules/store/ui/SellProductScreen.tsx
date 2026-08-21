import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useWarehouseStore } from '@/modules/warehouse/state/warehouse-store';
import type { ClonePrefill, VariantInput } from '@/modules/commerce/domain/stock-core';
import {
  channelToCondition,
  conditionHint,
  conditionLabel,
  conditionToChannel,
  type ProductCondition,
} from '@/modules/commerce/domain/product-condition';
import type { CustomFieldValue, ProductMediaItem, WarehouseId } from '@/modules/commerce/domain/types';
import {
  MAX_ARTICLE_IMAGES,
  MAX_PRODUCT_MEDIA,
  fromLegacyImages,
  mergeArticleImages,
  mergePickedMedia,
  replaceMediaAt,
} from '@/modules/commerce/domain/product-media';
import {
  customFieldsFromSpecs,
  specsFromCustomFields,
  suggestedSpecsForCategory,
  variantDetailAttrs,
} from '@/modules/commerce/domain/product-specs';
import { pickProductMediaFromLibrary } from '@/modules/commerce/data/product-media';
import { ProductMediaStrip } from '@/modules/store/ui/sell/ProductMediaStrip';
import { SpecRowsEditor } from '@/modules/store/ui/sell/SpecRowsEditor';
import { FormTextInput } from '@/shared/components/FormTextInput';
import { colors } from '@/shared/theme/colors';
import {
  newDraftVariant,
  VariantInventorySection,
  type DraftVariant,
} from '@/modules/store/ui/sell/VariantInventorySection';

const MY_WAREHOUSE_ID = 'wh-boom-ev';

/**
 * Dedicated sell / listing form. Keep this off CreatePostScreen so Expo Router
 * cannot keep serving the old clip+sell layout from a stale module.
 */
export function SellProductScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    category?: string | string[];
    categoryLabel?: string | string[];
    clone?: string | string[];
  }>();

  const cloneRaw = Array.isArray(params.clone) ? params.clone[0] : params.clone;
  let prefill: ClonePrefill | null = null;
  if (cloneRaw) {
    try {
      prefill = JSON.parse(cloneRaw) as ClonePrefill;
    } catch {
      prefill = null;
    }
  }

  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const categoryLabelParam = Array.isArray(params.categoryLabel)
    ? params.categoryLabel[0]
    : params.categoryLabel;
  const categoryKey =
    categoryParam && categoryParam !== 'all' ? categoryParam : prefill?.categoryKey;
  const categoryLabel =
    categoryLabelParam && categoryParam !== 'all' ? categoryLabelParam : undefined;

  const [media, setMedia] = useState<ProductMediaItem[]>(() =>
    prefill?.media?.length ? prefill.media.map((item) => ({ ...item })) : fromLegacyImages(prefill?.imageUris),
  );
  const [specImages, setSpecImages] = useState<ProductMediaItem[]>(() =>
    (prefill?.specImages ?? []).map((item) => ({ ...item })),
  );
  const [usageImages, setUsageImages] = useState<ProductMediaItem[]>(() =>
    (prefill?.usageImages ?? []).map((item) => ({ ...item })),
  );
  const [title, setTitle] = useState(() => prefill?.title ?? '');
  const [description, setDescription] = useState(() => prefill?.description ?? '');
  const [usageGuide, setUsageGuide] = useState(() => prefill?.usageGuide ?? '');
  const [condition, setCondition] = useState<ProductCondition>(() =>
    channelToCondition(prefill?.channel ?? 'B2C'),
  );
  const [basePrice, setBasePrice] = useState(() =>
    prefill ? String(prefill.basePrice) : '8500',
  );
  const [simpleStock, setSimpleStock] = useState(() => (prefill ? '0' : '10'));
  const clonedMulti = (prefill?.variants.length ?? 0) > 1;
  const [hasVariants, setHasVariants] = useState(clonedMulti);
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>(() => {
    if (prefill?.variants.length) {
      return prefill.variants.map((v) =>
        newDraftVariant({
          label: v.label,
          price: String(v.price),
          stock: '0',
          imageUri: v.imageUri ?? null,
          attrs: v.attrs,
        }),
      );
    }
    return [
      newDraftVariant({ label: '', price: '8500', stock: '1' }),
      newDraftVariant({ label: '', price: '12500', stock: '1' }),
    ];
  });
  const [specRows, setSpecRows] = useState(() =>
    prefill?.customFields?.length
      ? specsFromCustomFields(prefill.customFields)
      : suggestedSpecsForCategory(categoryKey),
  );
  const [warehouseId, setWarehouseId] = useState<WarehouseId>('WH-CTI-MAIN');

  const warehouses = useInventoryStore((s) => s.warehouses);
  const createMasterWithVariants = useInventoryStore((s) => s.createMasterWithVariants);
  const onNewProductCreated = useWarehouseStore((s) => s.onNewProductCreated);

  const channel = conditionToChannel(condition);
  const remaining = Math.max(0, MAX_PRODUCT_MEDIA - media.length);

  const closeAll = () => {
    if (router.canDismiss()) router.dismissAll();
    else router.back();
  };

  const pickSellImages = async () => {
    if (remaining <= 0) {
      Alert.alert('สื่อครบแล้ว', `ลงได้สูงสุด ${MAX_PRODUCT_MEDIA} ไฟล์ต่อสินค้า`);
      return;
    }
    const picked = await pickProductMediaFromLibrary({
      selectionLimit: remaining,
      allowVideo: true,
    });
    if (!picked?.length) return;
    const merged = mergePickedMedia(media, picked);
    if (!merged.ok) {
      Alert.alert('เพิ่มสื่อไม่ได้', merged.reason);
      return;
    }
    setMedia(merged.media);
    void Haptics.selectionAsync();
  };

  const replaceSellImage = async (index: number) => {
    const picked = await pickProductMediaFromLibrary({
      selectionLimit: 1,
      allowVideo: true,
    });
    if (!picked?.length) return;
    const result = replaceMediaAt(media, index, picked);
    if (!result.ok) {
      Alert.alert('เปลี่ยนสื่อไม่ได้', result.reason);
      return;
    }
    setMedia(result.media);
    void Haptics.selectionAsync();
  };

  const pickVariantPhoto = async (id: string) => {
    const picked = await pickProductMediaFromLibrary({
      selectionLimit: 1,
      allowVideo: false,
    });
    const photo = picked?.find((item) => item.type === 'image');
    if (!photo) {
      if (picked?.length) Alert.alert('ต้องเป็นรูป', 'ตัวเลือกย่อยใช้ได้เฉพาะรูปภาพ');
      return;
    }
    setDraftVariants((prev) => prev.map((v) => (v.id === id ? { ...v, imageUri: photo.uri } : v)));
    void Haptics.selectionAsync();
  };

  const pickArticleImages = async (
    current: ProductMediaItem[],
    setter: React.Dispatch<React.SetStateAction<ProductMediaItem[]>>,
  ) => {
    const remaining = Math.max(0, MAX_ARTICLE_IMAGES - current.length);
    if (remaining <= 0) {
      Alert.alert('รูปครบแล้ว', `ใส่ได้สูงสุด ${MAX_ARTICLE_IMAGES} รูป`);
      return;
    }
    const picked = await pickProductMediaFromLibrary({
      selectionLimit: remaining,
      allowVideo: false,
    });
    if (!picked?.length) return;
    const merged = mergeArticleImages(current, picked);
    if (!merged.ok) {
      Alert.alert('เพิ่มรูปไม่ได้', merged.reason);
      return;
    }
    setter(merged.media);
    void Haptics.selectionAsync();
  };

  const replaceArticleImage = async (
    setter: React.Dispatch<React.SetStateAction<ProductMediaItem[]>>,
    index: number,
  ) => {
    const picked = await pickProductMediaFromLibrary({
      selectionLimit: 1,
      allowVideo: false,
    });
    if (!picked?.length) return;
    const photo = picked.find((item) => item.type === 'image');
    if (!photo) {
      Alert.alert('ต้องเป็นรูป', 'ใส่ได้เฉพาะรูปภาพ');
      return;
    }
    setter((prev) => prev.map((item, i) => (i === index ? photo : item)));
    void Haptics.selectionAsync();
  };

  const toggleHasVariants = (on: boolean) => {
    setHasVariants(on);
    if (on && draftVariants.length === 0) {
      setDraftVariants([
        newDraftVariant({
          price: basePrice,
          stock: simpleStock || '1',
        }),
      ]);
    }
    void Haptics.selectionAsync();
  };

  const patchVariant = (id: string, patch: Partial<DraftVariant>) => {
    setDraftVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const addVariantRow = () => {
    setDraftVariants((prev) => [
      ...prev,
      newDraftVariant({ price: basePrice }),
    ]);
    void Haptics.selectionAsync();
  };

  const removeVariantRow = (id: string) => {
    setDraftVariants((prev) => (prev.length <= 1 ? prev : prev.filter((v) => v.id !== id)));
    void Haptics.selectionAsync();
  };

  const bumpVariantStock = (id: string, delta: 1 | -1) => {
    setDraftVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        return { ...v, stock: String(Math.max(0, (Number(v.stock) || 0) + delta)) };
      }),
    );
    void Haptics.selectionAsync();
  };

  const bumpSimpleStock = (delta: 1 | -1) => {
    setSimpleStock((raw) => String(Math.max(0, (Number(raw) || 0) + delta)));
    void Haptics.selectionAsync();
  };

  const save = () => {
    if (!title.trim()) {
      Alert.alert('ยังไม่มีชื่อสินค้า', 'พิมพ์ชื่อให้รู้ว่าขายอะไรนะ');
      return;
    }

    const prepared: VariantInput[] = [];
    let listingPrice = 0;
    let listingStock = 0;
    const wh =
      warehouses.find((w) => w.channelFocus.includes(channel))?.id ?? warehouseId;

    if (hasVariants) {
      if (!draftVariants.length) {
        Alert.alert('ยังไม่มีตัวเลือก', 'เพิ่มอย่างน้อย 1 ตัวเลือกย่อย หรือปิดสวิตช์ตัวเลือกย่อย');
        return;
      }
      for (const [i, v] of draftVariants.entries()) {
        const label = v.label.trim() || `ตัวเลือก ${i + 1}`;
        const price = Number(v.price);
        const stock = Number(v.stock);
        if (!Number.isFinite(price) || price <= 0) {
          Alert.alert('ราคาไม่ถูกต้อง', `ใส่ราคาตัวเลือกย่อยที่ ${i + 1} ให้มากกว่า 0`);
          return;
        }
        if (!Number.isInteger(stock) || stock < 0) {
          Alert.alert('สต็อกไม่ถูกต้อง', `จำนวนชิ้นของตัวเลือกที่ ${i + 1} ต้องเป็นจำนวนเต็มไม่ติดลบ`);
          return;
        }
        if (!v.imageUri) {
          Alert.alert('ยังไม่มีรูปตัวเลือก', `เพิ่มรูปให้ตัวเลือกย่อยที่ ${i + 1} ก่อนบันทึก`);
          return;
        }
        prepared.push({
          label,
          sku: `BEV-${`${Date.now()}`.slice(-6)}-${i + 1}`,
          price,
          attrs: variantDetailAttrs(v.attrs, { size: v.size, weight: v.weight, note: v.note }),
          warehouseId: wh,
          onHand: stock,
          imageUri: v.imageUri,
        });
      }
      listingPrice = Math.min(...prepared.map((v) => v.price));
      listingStock = prepared.reduce((sum, v) => sum + v.onHand, 0);
    } else {
      const price = Number(basePrice);
      const stock = Number(simpleStock);
      if (!Number.isFinite(price) || price <= 0) {
        Alert.alert('ราคาไม่ถูกต้อง', 'กรุณาใส่ราคามากกว่า 0');
        return;
      }
      if (!Number.isInteger(stock) || stock < 0) {
        Alert.alert('สต็อกไม่ถูกต้อง', 'จำนวนชิ้นต้องเป็นจำนวนเต็มไม่ติดลบ');
        return;
      }
      prepared.push({
        label: 'มาตรฐาน',
        sku: `BEV-${`${Date.now()}`.slice(-6)}-A`,
        price,
        attrs: {},
        warehouseId: wh,
        onHand: stock,
      });
      listingPrice = price;
      listingStock = stock;
    }

    const customFields: CustomFieldValue[] = customFieldsFromSpecs(specRows);

    const skuTail = `${Date.now()}`.slice(-6);
    const masterId = createMasterWithVariants({
      title: title.trim(),
      masterSku: prefill ? `BEV-CLONE-${skuTail}` : `BEV-${condition === 'used' ? 'USED' : 'NEW'}-${skuTail}`,
      channel,
      basePrice: listingPrice,
      tags: [channel, 'Shop'],
      customFields,
      description: description.trim() || undefined,
      usageGuide: usageGuide.trim() || undefined,
      specImages,
      usageImages,
      categoryKey,
      media: media.length
        ? media
        : prepared
            .map((v) => v.imageUri)
            .filter((uri): uri is string => Boolean(uri))
            .map((uri) => ({ uri, type: 'image' as const })),
      variants: prepared,
    });
    onNewProductCreated(MY_WAREHOUSE_ID, masterId, categoryKey);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const variantSummary = hasVariants
      ? `${prepared.length} ตัวเลือกย่อย · สต็อกรวม ${listingStock.toLocaleString('th-TH')} ชิ้น`
      : `${listingStock.toLocaleString('th-TH')} ชิ้น`;
    Alert.alert(
      prefill ? 'คัดลอกมาลงขายแล้ว' : 'ลงขายแล้ว',
      prefill
        ? 'สร้างเป็นสินค้าชิ้นใหม่แล้ว ของเดิมไม่เปลี่ยน'
        : `ลงขายเป็น${conditionLabel(condition)} ราคา ฿${listingPrice.toLocaleString('th-TH')} · ${variantSummary}`,
    );
    closeAll();
  };

  return (
    <>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>{prefill ? 'คัดลอกมาลงขายใหม่' : 'ลงขายสินค้า'}</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 28 + Math.max(insets.bottom, 10) + 58,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {prefill ? (
            <View style={styles.cloneBanner}>
              <Ionicons name="copy-outline" size={16} color={colors.accent.info} />
              <Text style={styles.cloneBannerText}>
                คัดลอกจากของเดิมมาให้แล้ว — แก้ชื่อ ราคา จำนวนได้ตามใจ ของเดิมไม่หาย SKU
                และบาร์โค้ดจะสร้างใหม่ตอนบันทึก สต็อกเริ่มที่ 0
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={{ marginBottom: 14 }}>
              <ProductMediaStrip
                items={media}
                onAdd={pickSellImages}
                onRemove={(index) => setMedia((prev) => prev.filter((_, i) => i !== index))}
                onReplace={replaceSellImage}
                onUpdateItem={(index, patch) =>
                  setMedia((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
                  )
                }
                onMove={(index, direction) => {
                  const target = index + direction;
                  setMedia((prev) => {
                    if (target < 0 || target >= prev.length) return prev;
                    const next = [...prev];
                    [next[index], next[target]] = [next[target], next[index]];
                    return next;
                  });
                }}
              />
            </View>

            <Text style={styles.fieldLabel}>สภาพ</Text>
            <View style={styles.segmented}>
              {(['new', 'used'] as ProductCondition[]).map((c) => {
                const active = condition === c;
                return (
                  <Pressable
                    key={c}
                    style={[styles.segment, active && styles.segmentActive]}
                    onPress={() => {
                      setCondition(c);
                      const ch = conditionToChannel(c);
                      const found = warehouses.find((w) => w.channelFocus.includes(ch));
                      if (found) setWarehouseId(found.id);
                      void Haptics.selectionAsync();
                    }}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {conditionLabel(c)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.conditionHint}>{conditionHint(condition)}</Text>

            {categoryLabel ? (
              <View style={styles.categoryHint}>
                <Ionicons name="pricetag" size={13} color={colors.brand.primaryDark} />
                <Text style={styles.categoryHintText}>หมวด: {categoryLabel}</Text>
              </View>
            ) : null}

            <FormTextInput
              label="ชื่อสินค้า"
              style={styles.lineInput}
              value={title}
              onChangeText={setTitle}
              placeholder="เช่น มอเตอร์ QS 12 นิ้ว"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="sentences"
              containerStyle={{ marginBottom: 14 }}
            />

            <VariantInventorySection
              hasVariants={hasVariants}
              onToggle={toggleHasVariants}
              variants={draftVariants}
              onPatch={patchVariant}
              onAdd={addVariantRow}
              onRemove={removeVariantRow}
              onBumpVariant={bumpVariantStock}
              onPickPhoto={pickVariantPhoto}
              simplePrice={basePrice}
              simpleStock={simpleStock}
              onSimplePrice={setBasePrice}
              onSimpleStock={setSimpleStock}
              onBumpSimple={bumpSimpleStock}
              simpleStockPlaceholder={prefill ? 'ใส่จำนวนใหม่' : 'เช่น 10'}
            />

            <View style={{ marginTop: 16 }}>
              <SpecRowsEditor
                title="คุณสมบัติ"
                hint="พิมพ์เองได้ทั้งชื่อและค่า เช่น แรงดัน 48V · ความจุใช้กับแบตเตอรี่เท่านั้น"
                rows={specRows}
                onChange={setSpecRows}
              />
            </View>

            <View style={{ marginTop: 16 }}>
              <ProductMediaStrip
                title={`รูปสเปก (${specImages.length}/${MAX_ARTICLE_IMAGES})`}
                hint="รูปตารางสเปก ฉลาก หรือขนาดสินค้า"
                addLabel="รูปสเปก"
                showCoverBadge={false}
                maxItems={MAX_ARTICLE_IMAGES}
                items={specImages}
                onAdd={() => void pickArticleImages(specImages, setSpecImages)}
                onRemove={(index) => setSpecImages((prev) => prev.filter((_, i) => i !== index))}
                onReplace={(index) => void replaceArticleImage(setSpecImages, index)}
              />
            </View>

            <View style={{ marginTop: 16 }}>
              <ProductMediaStrip
                title={`รูปวิธีใช้ (${usageImages.length}/${MAX_ARTICLE_IMAGES})`}
                hint="รูปขั้นตอนหรือวิธีติดตั้ง"
                addLabel="รูปวิธีใช้"
                showCoverBadge={false}
                maxItems={MAX_ARTICLE_IMAGES}
                items={usageImages}
                onAdd={() => void pickArticleImages(usageImages, setUsageImages)}
                onRemove={(index) => setUsageImages((prev) => prev.filter((_, i) => i !== index))}
                onReplace={(index) => void replaceArticleImage(setUsageImages, index)}
              />
            </View>

            <FormTextInput
              label="รายละเอียดโดยรวม"
              style={styles.articleInput}
              placeholder="เขียนเป็นบทความได้ เช่น จุดเด่น วัสดุ การรับประกัน และรายละเอียดสินค้า"
              placeholderTextColor={colors.text.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              autoCapitalize="sentences"
              scrollEnabled
              containerStyle={{ marginTop: 16 }}
            />

            <FormTextInput
              label="วิธีการใช้"
              style={styles.articleInput}
              placeholder="เขียนวิธีติดตั้งหรือวิธีใช้เป็นบทความ ใส่รูปขั้นตอนด้านบนได้"
              placeholderTextColor={colors.text.muted}
              value={usageGuide}
              onChangeText={setUsageGuide}
              multiline
              autoCapitalize="sentences"
              scrollEnabled
              containerStyle={{ marginTop: 16 }}
            />
          </View>
        </ScrollView>

        <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable style={styles.cancelBtn} onPress={closeAll}>
            <Text style={styles.cancelBtnText}>ยกเลิก</Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={save} accessibilityRole="button">
            <Text style={styles.saveBtnText}>บันทึกสินค้า</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  scroll: { flex: 1 },
  cloneBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#E8F1FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  cloneBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    lineHeight: 17,
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  photoStrip: { gap: 8, paddingVertical: 2 },
  photoTile: {
    width: 80,
    height: 80,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.brand.forest,
  },
  coverBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  coverBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  removePhoto: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoTile: {
    width: 80,
    height: 80,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(10,22,17,0.22)',
    backgroundColor: '#F2F4F3',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { color: colors.text.secondary, fontSize: 11, fontWeight: '800' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#EEF1EF',
    borderRadius: 12,
    padding: 3,
    marginBottom: 6,
  },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  segmentTextActive: { color: colors.text.primary },
  conditionHint: {
    marginBottom: 12,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  categoryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand.mist,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  categoryHintText: { color: colors.brand.primaryDark, fontSize: 12, fontWeight: '800' },
  lineInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 15,
  },
  areaInput: {
    minHeight: 88,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  articleInput: {
    minHeight: 180,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  cancelBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
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
    borderRadius: 14,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
