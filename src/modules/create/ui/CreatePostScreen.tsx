import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useWarehouseStore } from '@/modules/warehouse/state/warehouse-store';
import type { ClonePrefill, VariantInput } from '@/modules/commerce/domain/stock-core';
import {
  channelToCondition,
  conditionHint,
  conditionLabel,
  conditionToChannel,
  type ProductCondition,
} from '@/modules/commerce/domain/product-condition';
import type { CustomFieldValue, WarehouseId } from '@/modules/commerce/domain/types';
import {
  MediaGalleryPicker,
  type PickedGalleryItem,
} from '@/shared/media/MediaGalleryPicker';
import { FormTextInput } from '@/shared/components/FormTextInput';
import { colors } from '@/shared/theme/colors';

const MAX_PRODUCT_IMAGES = 6;
const MY_WAREHOUSE_ID = 'wh-boom-ev';

type GalleryPurpose = 'post' | 'sell';

type DraftVariant = {
  id: string;
  label: string;
  price: string;
  stock: string;
  imageUri: string | null;
};

function newDraftVariant(seed?: Partial<DraftVariant>): DraftVariant {
  return {
    id: `dv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    price: '',
    stock: '1',
    imageUri: null,
    ...seed,
  };
}

/** Keep digits (and one decimal) after paste / typing — do not use input type=number (breaks paste on web). */
function sanitizeDecimal(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('')}` : head;
}

function sanitizeInt(raw: string) {
  return raw.replace(/[^\d]/g, '');
}

export function CreatePostScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    category?: string;
    categoryLabel?: string;
    clone?: string;
    mode?: string;
  }>();

  /** คัดลอกสินค้า → ลงเป็นชิ้นใหม่ (ไม่แก้ของเดิม) */
  let prefill: ClonePrefill | null = null;
  if (typeof params.clone === 'string' && params.clone) {
    try {
      prefill = JSON.parse(params.clone) as ClonePrefill;
    } catch {
      prefill = null;
    }
  }

  const categoryKey =
    typeof params.category === 'string' && params.category !== 'all'
      ? params.category
      : prefill?.categoryKey;
  const categoryLabel =
    typeof params.categoryLabel === 'string' && params.category !== 'all'
      ? params.categoryLabel
      : undefined;

  /** Hub / store / clone → sell-only (ไม่ปนคลิปหรือเว็บบอร์ด) */
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const sellOnly = modeParam !== 'post';
  const mode: 'post' | 'sell' = sellOnly ? 'sell' : 'post';
  const [caption, setCaption] = useState('');
  const [postPrice, setPostPrice] = useState('1990');
  const [postCondition, setPostCondition] = useState<ProductCondition>('new');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  /** Legacy clip+sell — off by default; content clips use CameraStudio hub path */
  const [sellWithClip, setSellWithClip] = useState(false);
  const [postProductName, setPostProductName] = useState('');
  const [postStock, setPostStock] = useState('10');

  const [sellImages, setSellImages] = useState<string[]>(() => prefill?.imageUris ?? []);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryPurpose, setGalleryPurpose] = useState<GalleryPurpose>('sell');
  const [title, setTitle] = useState(() => prefill?.title ?? '');
  const [description, setDescription] = useState(() => prefill?.description ?? '');
  const [masterSku, setMasterSku] = useState(() =>
    prefill ? `BEV-CLONE-${`${Date.now()}`.slice(-5)}` : `BEV-${`${Date.now()}`.slice(-6)}`,
  );
  const [condition, setCondition] = useState<ProductCondition>(() =>
    channelToCondition(prefill?.channel ?? 'B2C'),
  );
  const [basePrice, setBasePrice] = useState(() =>
    prefill ? String(prefill.basePrice) : '1990',
  );
  const [simpleStock, setSimpleStock] = useState(() => (prefill ? '0' : '10'));

  const [hasVariants, setHasVariants] = useState(true);
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>(() => {
    if (prefill?.variants.length) {
      return prefill.variants.map((v) =>
        newDraftVariant({
          label: v.label,
          price: String(v.price),
          stock: '0',
          imageUri: v.imageUri ?? null,
        }),
      );
    }
    return [
      newDraftVariant({ label: '', price: '8500', stock: '1' }),
      newDraftVariant({ label: '', price: '12500', stock: '1' }),
    ];
  });
  const [warehouseId, setWarehouseId] = useState<WarehouseId>('WH-CTI-MAIN');
  const channel = conditionToChannel(condition);
  const postChannel = conditionToChannel(postCondition);
  const [fieldValues] = useState<Record<string, string>>(() =>
    prefill
      ? Object.fromEntries(prefill.customFields.map((f) => [f.key, String(f.value)]))
      : {},
  );

  const warehouses = useInventoryStore((s) => s.warehouses);
  const customFieldDefs = useInventoryStore((s) => s.customFieldDefs);
  const createMasterWithVariants = useInventoryStore((s) => s.createMasterWithVariants);
  const addPost = useFeedStore((s) => s.addPost);
  const onNewProductCreated = useWarehouseStore((s) => s.onNewProductCreated);

  const pickMedia = () => {
    setGalleryPurpose('post');
    setGalleryOpen(true);
  };

  const pickSellImages = () => {
    const remaining = MAX_PRODUCT_IMAGES - sellImages.length;
    if (remaining <= 0) {
      Alert.alert('รูปครบแล้ว', `ลงได้สูงสุด ${MAX_PRODUCT_IMAGES} รูปต่อสินค้า`);
      return;
    }
    setGalleryPurpose('sell');
    setGalleryOpen(true);
  };

  const onGallerySend = (items: PickedGalleryItem[]) => {
    setGalleryOpen(false);
    if (!items.length) return;
    if (galleryPurpose === 'post') {
      const first = items[0]!;
      setMediaUri(first.uri);
      setMediaType(first.mediaType === 'video' ? 'video' : 'image');
      void Haptics.selectionAsync();
      return;
    }
    setSellImages((prev) =>
      [...prev, ...items.filter((i) => i.mediaType === 'photo').map((i) => i.uri)].slice(
        0,
        MAX_PRODUCT_IMAGES,
      ),
    );
    void Haptics.selectionAsync();
  };

  const removeSellImage = (uri: string) => {
    setSellImages((prev) => prev.filter((u) => u !== uri));
  };

  const patchVariant = (id: string, patch: Partial<DraftVariant>) => {
    setDraftVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
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

  const addVariantRow = () => {
    setDraftVariants((prev) => [...prev, newDraftVariant({ price: basePrice })]);
    void Haptics.selectionAsync();
  };

  const removeVariantRow = (id: string) => {
    setDraftVariants((prev) => prev.filter((v) => v.id !== id));
    void Haptics.selectionAsync();
  };

  const bumpVariantStock = (id: string, delta: 1 | -1) => {
    setDraftVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const next = Math.max(0, (Number(v.stock) || 0) + delta);
        return { ...v, stock: String(next) };
      }),
    );
    void Haptics.selectionAsync();
  };

  const bumpSimpleStock = (delta: 1 | -1) => {
    setSimpleStock((raw) => String(Math.max(0, (Number(raw) || 0) + delta)));
    void Haptics.selectionAsync();
  };

  const closeAll = () => {
    if (router.canDismiss()) router.dismissAll();
    else router.back();
  };

  const publish = () => {
    if (mode === 'post') {
      if (!caption.trim() && !mediaUri) {
        Alert.alert('ยังไม่มีเนื้อหา', 'กรุณาเลือกรูป/วิดีโอ หรือพิมพ์แคปชันก่อนโพสต์');
        return;
      }

      let masterProductId: string | undefined;
      let sellPrice = Number(postPrice) || 0;
      let sellStock = Number(postStock);
      const productName =
        postProductName.trim() || caption.trim().slice(0, 60) || 'สินค้าจากคลิป';

      if (sellWithClip) {
        if (!Number.isFinite(sellPrice) || sellPrice <= 0) {
          Alert.alert('ราคาไม่ถูกต้อง', 'กรุณาใส่ราคาสินค้าก่อนลงขายพร้อมคลิป');
          return;
        }
        if (!Number.isFinite(sellStock) || sellStock < 0) {
          Alert.alert('สต็อกไม่ถูกต้อง', 'กรุณาใส่จำนวนสต็อกเป็นตัวเลข');
          return;
        }
        const skuTail = `${Date.now()}`.slice(-6);
        masterProductId = createMasterWithVariants({
          title: productName,
          masterSku: `BEV-CLIP-${skuTail}`,
          channel: postChannel,
          basePrice: sellPrice,
          tags: [postChannel, 'Clip', 'Shop'],
          customFields: [],
          description: caption.trim() || undefined,
          imageUris: mediaType === 'image' && mediaUri ? [mediaUri] : undefined,
          variants: [
            {
              label: 'มาตรฐาน',
              sku: `BEV-CLIP-${skuTail}-A`,
              price: sellPrice,
              attrs: {},
              warehouseId,
              onHand: sellStock,
            },
          ],
        });
        onNewProductCreated(MY_WAREHOUSE_ID, masterProductId, categoryKey);
      }

      addPost({
        caption: caption.trim(),
        price: sellWithClip ? sellPrice : Number(postPrice) || 0,
        channel: postChannel,
        imageUri: mediaType === 'image' ? mediaUri ?? undefined : undefined,
        videoUri: mediaType === 'video' ? mediaUri ?? undefined : undefined,
        productName: sellWithClip ? productName : undefined,
        masterProductId,
        stock: sellWithClip ? sellStock : undefined,
        intent: 'content',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        sellWithClip ? 'โพสต์และลงขายแล้ว' : 'โพสต์แล้ว',
        sellWithClip
          ? 'คลิปขึ้นฟีดแล้ว และคนดูซื้อของจากคลิปได้'
          : 'คลิปขึ้นฟีดแล้ว',
      );
      closeAll();
      return;
    }

    if (!title.trim()) {
      Alert.alert('ยังไม่มีชื่อสินค้า', 'พิมพ์ชื่อให้รู้ว่าขายอะไรนะ');
      return;
    }

    const autoSku =
      masterSku.trim() ||
      `BEV-${condition === 'used' ? 'USED' : 'NEW'}-${`${Date.now()}`.slice(-6)}`;
    const wh =
      warehouses.find((w) => w.channelFocus.includes(channel))?.id ?? warehouseId;

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

    const prepared: VariantInput[] = [];
    let listingPrice = 0;
    let listingStock = 0;

    if (hasVariants) {
      if (!draftVariants.length) {
        Alert.alert('ยังไม่มีตัวเลือก', 'เพิ่มอย่างน้อย 1 ตัวเลือกย่อย หรือปิดสวิตช์ตัวเลือกย่อย');
        return;
      }
      for (let i = 0; i < draftVariants.length; i++) {
        const v = draftVariants[i]!;
        if (!v.label.trim()) {
          Alert.alert('ยังไม่มีชื่อตัวเลือก', `ใส่ชื่อตัวเลือกที่ ${i + 1} เช่น 12 นิ้ว 3000W`);
          return;
        }
        const price = Number(v.price);
        if (!Number.isFinite(price) || price <= 0) {
          Alert.alert('ราคายังไม่ถูก', `ใส่ราคาตัวเลือก “${v.label.trim()}” ให้มากกว่า 0`);
          return;
        }
        const stockQty = Number(v.stock);
        if (!Number.isFinite(stockQty) || stockQty < 0 || !Number.isInteger(stockQty)) {
          Alert.alert('จำนวนยังไม่ถูก', `ใส่สต็อกตัวเลือก “${v.label.trim()}” เป็นจำนวนเต็มไม่ติดลบ`);
          return;
        }
        prepared.push({
          label: v.label.trim(),
          sku: `${autoSku}-V${i + 1}`,
          price,
          attrs: {},
          warehouseId: wh,
          onHand: stockQty,
          imageUri: v.imageUri ?? undefined,
        });
      }
      listingPrice = Math.min(...prepared.map((v) => v.price));
      listingStock = prepared.reduce((sum, v) => sum + v.onHand, 0);
    } else {
      const price = Number(basePrice);
      if (!Number.isFinite(price) || price <= 0) {
        Alert.alert('ราคายังไม่ถูก', 'ใส่ตัวเลขราคามากกว่า 0 นะ');
        return;
      }
      const stockQty = Number(simpleStock);
      if (!Number.isFinite(stockQty) || stockQty < 0) {
        Alert.alert('จำนวนยังไม่ถูก', 'ใส่จำนวนชิ้นที่มีขายเป็นตัวเลขนะ');
        return;
      }
      listingPrice = price;
      listingStock = stockQty;
      prepared.push({
        label: 'มาตรฐาน',
        sku: `${autoSku}-A`,
        price,
        attrs: {},
        warehouseId: wh,
        onHand: stockQty,
      });
    }

    const coverUris =
      sellImages.length > 0
        ? sellImages
        : prepared.map((v) => v.imageUri).filter((u): u is string => Boolean(u));

    const masterId = createMasterWithVariants({
      title: title.trim(),
      masterSku: autoSku,
      channel,
      basePrice: listingPrice,
      tags: [conditionLabel(condition), 'Custom', ...(categoryLabel ? [categoryLabel] : [])],
      customFields,
      description: description.trim() || undefined,
      categoryKey,
      imageUris: coverUris.length ? coverUris : undefined,
      variants: prepared,
    });

    const syncedShops = onNewProductCreated(MY_WAREHOUSE_ID, masterId, categoryKey);

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const variantSummary = hasVariants
      ? `${prepared.length} ตัวเลือก · ${listingPrice.toLocaleString('th-TH')}${
          prepared.some((v) => v.price !== listingPrice)
            ? `–${Math.max(...prepared.map((v) => v.price)).toLocaleString('th-TH')}`
            : ''
        } บาท · รวม ${listingStock} ชิ้น`
      : `มี ${listingStock} ชิ้น`;
    Alert.alert(
      prefill ? 'คัดลอกสินค้าเรียบร้อย' : 'ลงขายเรียบร้อย',
      [
        prefill
          ? 'สร้างเป็นสินค้าชิ้นใหม่แล้ว ของเดิมไม่เปลี่ยน'
          : `ลงขายเป็น${conditionLabel(condition)} ราคา ฿${listingPrice.toLocaleString('th-TH')} · ${variantSummary}`,
        syncedShops > 0 ? `ร้านที่เชื่อมคลังเห็นสินค้านี้แล้ว ${syncedShops} ร้าน` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    closeAll();
  };

  const sellRemaining = Math.max(0, MAX_PRODUCT_IMAGES - sellImages.length);
  const galleryLimit = galleryPurpose === 'post' ? 1 : sellRemaining || 1;

  const variantPrices = draftVariants
    .map((v) => Number(v.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  const variantStockTotal = draftVariants.reduce((sum, v) => {
    const n = Number(v.stock);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const variantMin = variantPrices.length ? Math.min(...variantPrices) : null;
  const variantMax = variantPrices.length ? Math.max(...variantPrices) : null;
  const variantRangeLabel =
    variantMin == null || variantMax == null
      ? null
      : variantMin === variantMax
        ? `${variantMin.toLocaleString('th-TH')} บาท`
        : `${variantMin.toLocaleString('th-TH')} - ${variantMax.toLocaleString('th-TH')} บาท`;

  const sellForm = (
    <>
      {prefill ? (
        <View style={styles.cloneBanner}>
          <Ionicons name="happy-outline" size={16} color={colors.accent.info} />
          <Text style={styles.cloneBannerText}>
            คัดลอกจากของเดิมมาให้แล้ว — แก้ชื่อ ราคา จำนวนได้ตามใจ ของเดิมไม่หาย สต็อกเริ่มที่ 0
            ใส่จำนวนใหม่เองนะ
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ข้อมูลสินค้า</Text>

        <Text style={styles.fieldLabel}>
          รูปหลัก ({sellImages.length}/{MAX_PRODUCT_IMAGES})
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
          style={{ flexGrow: 0, marginBottom: 18 }}
        >
          {sellImages.map((uri, index) => (
            <View key={uri} style={styles.photoTile}>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              {index === 0 ? (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>ปก</Text>
                </View>
              ) : null}
              <Pressable
                style={styles.removePhoto}
                onPress={() => {
                  Alert.alert('ลบรูปนี้?', 'รูปจะถูกนำออกจากรายการ', [
                    { text: 'ยกเลิก', style: 'cancel' },
                    { text: 'ลบ', style: 'destructive', onPress: () => removeSellImage(uri) },
                  ]);
                }}
                hitSlop={8}
                accessibilityLabel="ลบรูป"
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}
          {sellImages.length < MAX_PRODUCT_IMAGES ? (
            <Pressable style={styles.addPhotoTile} onPress={pickSellImages}>
              <Ionicons name="camera-outline" size={22} color={colors.text.secondary} />
              <Text style={styles.addPhotoText}>เพิ่มรูป</Text>
            </Pressable>
          ) : null}
        </ScrollView>

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
                  const wh = warehouses.find((w) => w.channelFocus.includes(ch));
                  if (wh) setWarehouseId(wh.id);
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
          containerStyle={{ marginBottom: 16 }}
        />

        <View style={styles.variantToggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>มีตัวเลือกย่อยสินค้าหรือไม่?</Text>
            <Text style={styles.toggleHint}>เช่น 12 นิ้ว 3000W / 5000W — คนละราคา คนละสต็อก</Text>
          </View>
          <Switch
            value={hasVariants}
            onValueChange={toggleHasVariants}
            trackColor={{ false: '#D5DBD8', true: colors.brand.primary }}
            thumbColor="#fff"
          />
        </View>

        {hasVariants ? (
          <>
            {variantRangeLabel ? (
              <View style={styles.autoSummary}>
                <Text style={styles.autoSummaryText}>ช่วงราคา {variantRangeLabel}</Text>
                <Text style={styles.autoSummaryText}>
                  สต็อกรวม {variantStockTotal.toLocaleString('th-TH')} ชิ้น
                </Text>
              </View>
            ) : null}
            {draftVariants.map((v) => {
              const stockN = Number(v.stock) || 0;
              return (
                <View key={v.id} style={styles.variantCard}>
                  <View style={styles.variantNameRow}>
                    <Text style={styles.miniLabel}>ชื่อตัวเลือก</Text>
                    <Pressable
                      onPress={() => {
                        Alert.alert('ลบตัวเลือกนี้?', 'ตัวเลือกย่อยจะถูกนำออก', [
                          { text: 'ยกเลิก', style: 'cancel' },
                          { text: 'ลบ', style: 'destructive', onPress: () => removeVariantRow(v.id) },
                        ]);
                      }}
                      hitSlop={8}
                      accessibilityLabel="ลบตัวเลือกย่อย"
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.text.muted} />
                    </Pressable>
                  </View>
                  <FormTextInput
                    style={styles.variantNameInput}
                    value={v.label}
                    onChangeText={(t) => patchVariant(v.id, { label: t })}
                    placeholder="เช่น 12 นิ้ว 3000W"
                    placeholderTextColor={colors.text.muted}
                    autoCapitalize="sentences"
                  />
                  <View style={styles.variantGrid}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>ราคา (บาท)</Text>
                      <FormTextInput
                        style={styles.variantFieldInput}
                        value={v.price}
                        onChangeText={(t) => patchVariant(v.id, { price: sanitizeDecimal(t) })}
                        keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                        inputMode="decimal"
                        placeholder="8500"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>จำนวนชิ้น</Text>
                      <View style={styles.stockStepper}>
                        <Pressable
                          style={[styles.stockBtn, stockN <= 0 && styles.stockBtnDisabled]}
                          onPress={() => bumpVariantStock(v.id, -1)}
                          disabled={stockN <= 0}
                        >
                          <Text style={styles.stockBtnText}>−</Text>
                        </Pressable>
                        <FormTextInput
                          style={styles.stockInput}
                          value={v.stock}
                          onChangeText={(t) => patchVariant(v.id, { stock: sanitizeInt(t) })}
                          keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                          inputMode="numeric"
                          placeholder="0"
                          placeholderTextColor={colors.text.muted}
                          textAlign="center"
                        />
                        <Pressable style={styles.stockBtn} onPress={() => bumpVariantStock(v.id, 1)}>
                          <Text style={styles.stockBtnText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
            <Pressable style={styles.addVariantBtn} onPress={addVariantRow}>
              <Ionicons name="add" size={18} color={colors.brand.primaryDark} />
              <Text style={styles.addVariantText}>เพิ่มตัวเลือกย่อย</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.singleGrid}>
            <View style={{ flex: 1 }}>
              <FormTextInput
                label="ราคา (บาท)"
                style={styles.variantFieldInput}
                value={basePrice}
                onChangeText={(t) => setBasePrice(sanitizeDecimal(t))}
                keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                inputMode="decimal"
                placeholder="เช่น 8500"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniLabel}>จำนวนชิ้น</Text>
              <View style={styles.stockStepper}>
                <Pressable
                  style={[
                    styles.stockBtn,
                    (Number(simpleStock) || 0) <= 0 && styles.stockBtnDisabled,
                  ]}
                  onPress={() => bumpSimpleStock(-1)}
                  disabled={(Number(simpleStock) || 0) <= 0}
                >
                  <Text style={styles.stockBtnText}>−</Text>
                </Pressable>
                <FormTextInput
                  style={styles.stockInput}
                  value={simpleStock}
                  onChangeText={(t) => setSimpleStock(sanitizeInt(t))}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                  inputMode="numeric"
                  placeholder={prefill ? 'ใส่จำนวนใหม่' : 'เช่น 10'}
                  placeholderTextColor={colors.text.muted}
                  textAlign="center"
                />
                <Pressable style={styles.stockBtn} onPress={() => bumpSimpleStock(1)}>
                  <Text style={styles.stockBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <FormTextInput
          label="รายละเอียด (ไม่บังคับ)"
          style={styles.areaInput}
          placeholder="ของสภาพไหน ใช้นานแค่ไหน มีประกันไหม..."
          placeholderTextColor={colors.text.muted}
          value={description}
          onChangeText={setDescription}
          multiline
          autoCapitalize="sentences"
          scrollEnabled
          containerStyle={{ marginTop: 16, marginBottom: 0 }}
        />
      </View>
    </>
  );

  return (
    <>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          {mode === 'post' ? (
            <Pressable onPress={closeAll}>
              <Text style={styles.cancel}>ปิด</Text>
            </Pressable>
          ) : (
            <View style={{ width: 48 }} />
          )}
          <Text style={styles.title}>
            {prefill ? 'คัดลอกมาลงขายใหม่' : mode === 'sell' ? 'ลงขายสินค้า' : 'สร้าง'}
          </Text>
          {mode === 'post' ? (
            <Pressable onPress={publish}>
              <Text style={styles.publish}>
                {sellWithClip ? 'โพสต์และขาย' : 'โพสต์'}
              </Text>
            </Pressable>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: mode === 'sell' ? 28 + Math.max(insets.bottom, 10) + 58 : 40,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {mode === 'post' ? (
            <>
              <Pressable onPress={pickMedia}>
                <View style={styles.canvas}>
                  {mediaUri ? (
                    <>
                      <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      {mediaType === 'video' ? (
                        <View style={styles.videoBadge}>
                          <Ionicons name="videocam" size={14} color="#fff" />
                          <Text style={styles.videoBadgeText}>วิดีโอ</Text>
                        </View>
                      ) : null}
                      <View style={styles.changeMediaBadge}>
                        <Ionicons name="camera-reverse" size={14} color="#fff" />
                        <Text style={styles.videoBadgeText}>เปลี่ยนรูป/วิดีโอ</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Ionicons name="images" size={28} color={colors.brand.primary} />
                      <Text style={styles.canvasHint}>แตะเพื่อเลือกรูป/วิดีโอจาก Simulator (9:16)</Text>
                    </>
                  )}
                </View>
              </Pressable>
              <FormTextInput
                style={styles.input}
                placeholder="เขียนแคปชัน..."
                placeholderTextColor={colors.text.muted}
                value={caption}
                onChangeText={setCaption}
                multiline
              />

              {sellWithClip ? (
                <>
                  <Text style={styles.label}>ชื่อสินค้า</Text>
                  <FormTextInput
                    style={styles.inputSingle}
                    placeholder="เช่น แบต 60V (ว่างได้ ใช้แคปชันแทน)"
                    placeholderTextColor={colors.text.muted}
                    value={postProductName}
                    onChangeText={setPostProductName}
                  />
                  <Text style={styles.label}>ราคา (บาท)</Text>
                  <FormTextInput
                    style={styles.inputSingle}
                    placeholder="เช่น 1990"
                    placeholderTextColor={colors.text.muted}
                    value={postPrice}
                    onChangeText={(t) => setPostPrice(sanitizeDecimal(t))}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                  />
                  <Text style={styles.label}>มีกี่ชิ้น</Text>
                  <FormTextInput
                    style={styles.inputSingle}
                    placeholder="เช่น 10"
                    placeholderTextColor={colors.text.muted}
                    value={postStock}
                    onChangeText={(t) => setPostStock(sanitizeInt(t))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                  />
                  <Text style={styles.label}>สภาพสินค้า</Text>
                  <View style={styles.row}>
                    {(['new', 'used'] as ProductCondition[]).map((c) => (
                      <Pressable
                        key={c}
                        style={[styles.chip, postCondition === c && styles.chipActive]}
                        onPress={() => {
                          setPostCondition(c);
                          const ch = conditionToChannel(c);
                          const wh = warehouses.find((w) => w.channelFocus.includes(ch));
                          if (wh) setWarehouseId(wh.id);
                        }}
                      >
                        <Text style={[styles.chipText, postCondition === c && styles.chipTextActive]}>
                          {conditionLabel(c)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.conditionHint}>{conditionHint(postCondition)}</Text>
                </>
              ) : (
                <Text style={styles.sellOffNote}>
                  ปิดขายไว้ — โพสต์ดูอย่างเดียว ยังไม่มีปุ่มซื้อ
                </Text>
              )}
            </>
          ) : (
            sellForm
          )}
        </ScrollView>

        {mode === 'sell' ? (
          <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Pressable style={styles.cancelBtn} onPress={closeAll}>
              <Text style={styles.cancelBtnText}>ยกเลิก</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={publish} accessibilityRole="button">
              <Text style={styles.saveBtnText}>บันทึกสินค้า</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <MediaGalleryPicker
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSend={onGallerySend}
        initialMode="photo"
        allowModeSwitch={galleryPurpose === 'post'}
        selectionLimit={galleryLimit}
        sendLabel="ส่ง"
        title="ล่าสุด"
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  cancel: { color: colors.text.secondary, fontWeight: '600', fontSize: 16 },
  title: { fontWeight: '800', fontSize: 17, color: colors.text.primary },
  publish: { color: colors.brand.primaryDark, fontWeight: '800', fontSize: 16 },
  cloneBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#EAF3FF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(46,140,255,0.25)',
  },
  cloneBannerText: {
    flex: 1,
    color: '#1D5FAE',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 4,
  },
  fieldLabel: {
    color: colors.text.secondary,
    fontWeight: '700',
    marginBottom: 8,
    fontSize: 12,
  },
  miniLabel: {
    color: colors.text.muted,
    fontWeight: '700',
    fontSize: 11,
    marginBottom: 6,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#EEF1EF',
    borderRadius: 12,
    padding: 3,
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  segmentTextActive: {
    color: colors.text.primary,
  },
  lineInput: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 10,
    color: colors.text.primary,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderColor: colors.border.strong,
    fontSize: 16,
  },
  areaInput: {
    minHeight: 88,
    backgroundColor: '#F7F9F8',
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 15,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  variantToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  toggleHint: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    lineHeight: 16,
  },
  autoSummary: {
    backgroundColor: colors.brand.mist,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 2,
  },
  autoSummaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.brand.primaryDark,
  },
  singleGrid: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  variantCard: {
    backgroundColor: '#F7F9F8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    marginBottom: 10,
  },
  variantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  variantNameInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 15,
    marginBottom: 10,
  },
  variantGrid: { flexDirection: 'row', gap: 8 },
  variantFieldInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 15,
  },
  stockStepper: {
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
  addVariantBtn: {
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
  addVariantText: { color: colors.brand.primaryDark, fontSize: 14, fontWeight: '800' },
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
  sellOffNote: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
    lineHeight: 17,
    marginBottom: 8,
  },
  canvas: {
    height: 180,
    borderRadius: 20,
    backgroundColor: colors.brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
    gap: 8,
  },
  canvasHint: {
    color: colors.text.onDark,
    textAlign: 'center',
    paddingHorizontal: 24,
    fontWeight: '600',
  },
  videoBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  changeMediaBadge: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  input: {
    minHeight: 100,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 16,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  inputSingle: {
    backgroundColor: colors.surface.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  label: {
    color: colors.text.secondary,
    fontWeight: '700',
    marginBottom: 6,
    fontSize: 12,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
    maxWidth: '100%',
  },
  chipActive: { backgroundColor: colors.brand.ink, borderColor: colors.brand.ink },
  chipText: { color: colors.text.secondary, fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: colors.brand.primary },
  photoStrip: { gap: 8, paddingVertical: 2 },
  photoTile: {
    width: 92,
    height: 92,
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
    width: 92,
    height: 92,
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
  conditionHint: {
    marginBottom: 14,
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
});
