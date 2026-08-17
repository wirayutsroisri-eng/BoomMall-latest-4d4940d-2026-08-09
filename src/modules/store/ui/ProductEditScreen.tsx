import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { BarcodeScannerSheet } from '@/modules/store/ui/BarcodeScannerSheet';
import { pickProductMediaFromLibrary } from '@/modules/commerce/data/product-media';
import {
  MAX_ARTICLE_IMAGES,
  MAX_PRODUCT_MEDIA,
  mergeArticleImages,
  mergePickedMedia,
  replaceMediaAt,
  resolveProductMedia,
} from '@/modules/commerce/domain/product-media';
import type { CustomFieldValue, ProductMediaItem, WarehouseId } from '@/modules/commerce/domain/types';
import {
  customFieldsFromSpecs,
  specsFromCustomFields,
  suggestedSpecsForCategory,
  variantDetailAttrs,
} from '@/modules/commerce/domain/product-specs';
import { ProductMediaStrip } from '@/modules/store/ui/sell/ProductMediaStrip';
import { SpecRowsEditor } from '@/modules/store/ui/sell/SpecRowsEditor';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useCategoriesStore } from '@/modules/store/state/categories-store';
import { MY_SHOP_ID, useWarehouseStore } from '@/modules/warehouse/state/warehouse-store';
import type { VariantInput } from '@/modules/commerce/domain/stock-core';
import { colors } from '@/shared/theme/colors';
import {
  newDraftVariant,
  VariantInventorySection,
  type DraftVariant,
} from '@/modules/store/ui/sell/VariantInventorySection';
import {
  channelToCondition,
  conditionHint,
  conditionLabel,
  conditionToChannel,
  type ProductCondition,
} from '@/modules/commerce/domain/product-condition';

const MY_WAREHOUSE_ID = 'wh-boom-ev';

type FieldErrors = Partial<
  Record<'title' | 'sku' | 'barcode' | 'price' | 'cost' | 'stock' | 'photo', string>
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
  const { id: idParam, copied: copiedParam } = useLocalSearchParams<{
    id: string | string[];
    copied?: string | string[];
  }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const copiedFlag = Array.isArray(copiedParam) ? copiedParam[0] : copiedParam;

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const totalAvailable = useInventoryStore((s) => s.totalAvailable);
  const updateProduct = useInventoryStore((s) => s.updateProduct);
  const replaceMasterVariants = useInventoryStore((s) => s.replaceMasterVariants);
  const createMasterWithVariants = useInventoryStore((s) => s.createMasterWithVariants);
  const deleteProduct = useInventoryStore((s) => s.deleteProduct);
  const warehouses = useInventoryStore((s) => s.warehouses);
  const onNewProductCreated = useWarehouseStore((s) => s.onNewProductCreated);
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
  const [usageGuide, setUsageGuide] = useState('');
  const [priceText, setPriceText] = useState('');
  const [costText, setCostText] = useState('');
  const [stockText, setStockText] = useState('');
  const [condition, setCondition] = useState<ProductCondition>('new');
  const [hasVariants, setHasVariants] = useState(false);
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>([]);
  const [media, setMedia] = useState<ProductMediaItem[]>([]);
  const [specImages, setSpecImages] = useState<ProductMediaItem[]>([]);
  const [usageImages, setUsageImages] = useState<ProductMediaItem[]>([]);
  const [specRows, setSpecRows] = useState(() => suggestedSpecsForCategory());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState<'update' | 'duplicate' | null>(null);
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
    const nextUsage = master.usageGuide ?? '';
    const nextPrice = String(minPrice);
    const nextCost = String(avgCost);
    const nextStock = String(availableTotal);
    const nextCondition = channelToCondition(master.channel);
    const nextHasVariants = productVariants.length > 1;
    const nextDrafts = productVariants.map((v) =>
      newDraftVariant({
        id: v.id,
        label: v.label === 'มาตรฐาน' ? '' : v.label,
        price: String(v.price),
        stock: String(totalAvailable(v.id)),
        imageUri: v.imageUri ?? null,
        attrs: v.attrs,
      }),
    );
    const nextMedia = resolveProductMedia(master).map((item) => ({ ...item }));
    const nextSpecImages = (master.specImages ?? []).map((item) => ({ ...item }));
    const nextUsageImages = (master.usageImages ?? []).map((item) => ({ ...item }));
    const nextSpecs = specsFromCustomFields(master.customFields, undefined);
    const nextFieldsReady = nextSpecs.length ? nextSpecs : suggestedSpecsForCategory(nextCategory);

    setTitle(nextTitle);
    setSku(nextSku);
    setBarcode(nextBarcode);
    setCategoryKey(nextCategory);
    setDescription(nextDesc);
    setUsageGuide(nextUsage);
    setPriceText(nextPrice);
    setCostText(nextCost);
    setStockText(nextStock);
    setCondition(nextCondition);
    setHasVariants(nextHasVariants);
    setDraftVariants(nextDrafts);
    setMedia(nextMedia);
    setSpecImages(nextSpecImages);
    setUsageImages(nextUsageImages);
    setSpecRows(nextFieldsReady);
    setErrors({});
    setBaseline(
      JSON.stringify({
        title: nextTitle,
        sku: nextSku,
        barcode: nextBarcode,
        categoryKey: nextCategory,
        description: nextDesc,
        usageGuide: nextUsage,
        priceText: nextPrice,
        costText: nextCost,
        stockText: nextStock,
        condition: nextCondition,
        hasVariants: nextHasVariants,
        draftVariants: nextDrafts,
        media: nextMedia,
        specImages: nextSpecImages,
        usageImages: nextUsageImages,
        specRows: nextFieldsReady,
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
        usageGuide,
        priceText,
        costText,
        stockText,
        condition,
        hasVariants,
        draftVariants,
        media,
        specImages,
        usageImages,
        specRows,
      }),
    [
      title,
      sku,
      barcode,
      categoryKey,
      description,
      usageGuide,
      priceText,
      costText,
      stockText,
      condition,
      hasVariants,
      draftVariants,
      media,
      specImages,
      usageImages,
      specRows,
    ],
  );

  const isDirty = Boolean(baseline) && currentSnapshot !== baseline;

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    if (copiedFlag !== '1') return;
    showToast('สร้างสินค้าใหม่จากการคัดลอกเรียบร้อยแล้ว');
  }, [copiedFlag, showToast]);

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

  const toggleHasVariants = (on: boolean) => {
    setHasVariants(on);
    if (on && draftVariants.length === 0) {
      setDraftVariants([
        newDraftVariant({
          id: primaryVariant?.id,
          price: priceText,
          stock: stockText || '0',
        }),
      ]);
    }
    void Haptics.selectionAsync();
  };

  const patchVariant = (variantId: string, patch: Partial<DraftVariant>) => {
    setDraftVariants((prev) => prev.map((v) => (v.id === variantId ? { ...v, ...patch } : v)));
  };

  const addVariantRow = () => {
    setDraftVariants((prev) => [...prev, newDraftVariant({ price: priceText })]);
    void Haptics.selectionAsync();
  };

  const removeVariantRow = (variantId: string) => {
    setDraftVariants((prev) => (prev.length <= 1 ? prev : prev.filter((v) => v.id !== variantId)));
    void Haptics.selectionAsync();
  };

  const bumpVariantStock = (variantId: string, delta: 1 | -1) => {
    setDraftVariants((prev) =>
      prev.map((v) =>
        v.id === variantId
          ? { ...v, stock: String(Math.max(0, (Number(v.stock) || 0) + delta)) }
          : v,
      ),
    );
    void Haptics.selectionAsync();
  };

  const bumpSimpleStock = (delta: 1 | -1) => {
    setStockText((raw) => String(Math.max(0, (parseNonNegInt(raw) ?? 0) + delta)));
    void Haptics.selectionAsync();
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;
    setMedia((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    void Haptics.selectionAsync();
  };

  const openAddGallery = async () => {
    const remaining = Math.max(0, MAX_PRODUCT_MEDIA - media.length);
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

  const openReplaceGallery = async (index: number) => {
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

  const removeMediaAt = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
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

  const validateClient = (mode: 'update' | 'duplicate' = 'update'): FieldErrors => {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = 'กรุณาใส่ชื่อสินค้า';
    if (mode === 'update' && !sku.trim()) next.sku = 'กรุณาใส่ SKU';
    const cost = parseNonNegNumber(costText);
    if (costText.trim() && cost == null) next.cost = 'ต้นทุนต้องเป็นตัวเลข 0 ขึ้นไป';
    if (hasVariants) {
      if (!draftVariants.length) next.price = 'เพิ่มอย่างน้อย 1 ตัวเลือกย่อย';
      draftVariants.forEach((v, i) => {
        const price = parseNonNegNumber(v.price);
        if (price == null || price <= 0) next.price = `ราคาตัวเลือกที่ ${i + 1} ต้องมากกว่า 0`;
        if (mode === 'update') {
          const stock = parseNonNegInt(v.stock);
          if (stock == null) next.stock = `สต็อกตัวเลือกที่ ${i + 1} ต้องเป็นจำนวนเต็มไม่ติดลบ`;
        }
        if (!v.imageUri) next.photo = `เพิ่มรูปให้ตัวเลือกย่อยที่ ${i + 1}`;
      });
    } else {
      const price = parseNonNegNumber(priceText);
      if (price == null || price <= 0) next.price = 'ราคาต้องมากกว่า 0';
      if (mode === 'update') {
        const stock = parseNonNegInt(stockText);
        if (stock == null) next.stock = 'สต็อกต้องเป็นจำนวนเต็มไม่ติดลบ';
      }
    }
    return next;
  };

  const collectCustomFields = (): CustomFieldValue[] => customFieldsFromSpecs(specRows);

  const handleSubmit = () => {
    if (!master || saving) return;

    if (!isMine) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast('สินค้า Shared Listing — แก้ไขที่คลังต้นทางเท่านั้น');
      Alert.alert('แก้ไขไม่ได้', 'สินค้า Shared Listing แก้ไขที่คลังต้นทางเท่านั้น');
      return;
    }

    const clientErrors = validateClient('update');
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const first = Object.values(clientErrors)[0];
      showToast(first ?? 'กรุณาตรวจฟิลด์ที่จำเป็น');
      return;
    }

    const cost = costText.trim() ? parseNonNegNumber(costText)! : 0;
    const knownIds = new Set(productVariants.map((v) => v.id));
    const customFields = collectCustomFields();

    setSaving('update');
    const result = updateProduct(master.id, {
      title: title.trim(),
      masterSku: sku.trim(),
      barcode: barcode.trim() || null,
      categoryKey: categoryKey || undefined,
      description,
      usageGuide,
      specImages,
      usageImages,
      channel: conditionToChannel(condition),
      cost,
      media,
      customFields,
    });

    if (!result.ok) {
      setSaving(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (result.field) {
        setErrors((prev) => ({ ...prev, [result.field!]: result.reason }));
      }
      showToast(result.reason);
      Alert.alert('บันทึกไม่สำเร็จ', result.reason);
      return;
    }

    if (hasVariants) {
      const variantResult = replaceMasterVariants(
        master.id,
        draftVariants.map((v, i) => ({
          id: knownIds.has(v.id) ? v.id : undefined,
          label: v.label.trim() || `ตัวเลือก ${i + 1}`,
          price: parseNonNegNumber(v.price)!,
          stock: parseNonNegInt(v.stock)!,
          imageUri: v.imageUri,
          attrs: variantDetailAttrs(v.attrs, { size: v.size, weight: v.weight, note: v.note }),
        })),
      );
      setSaving(null);
      if (!variantResult.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast(variantResult.reason);
        Alert.alert('บันทึกตัวเลือกย่อยไม่สำเร็จ', variantResult.reason);
        return;
      }
    } else {
      const collapse = replaceMasterVariants(master.id, [
        {
          id: primaryVariant && knownIds.has(primaryVariant.id) ? primaryVariant.id : undefined,
          label:
            primaryVariant?.label && primaryVariant.label !== 'มาตรฐาน'
              ? primaryVariant.label
              : 'มาตรฐาน',
          price: parseNonNegNumber(priceText)!,
          stock: parseNonNegInt(stockText)!,
        },
      ]);
      setSaving(null);
      if (!collapse.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast(collapse.reason);
        Alert.alert('บันทึกไม่สำเร็จ', collapse.reason);
        return;
      }
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

  const handleSaveAsNew = () => {
    if (!master || saving) return;

    if (!isMine) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showToast('สินค้า Shared Listing — คัดลอกที่คลังต้นทางเท่านั้น');
      Alert.alert('คัดลอกไม่ได้', 'สินค้า Shared Listing คัดลอกที่คลังต้นทางเท่านั้น');
      return;
    }

    const clientErrors = validateClient('duplicate');
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const first = Object.values(clientErrors)[0];
      showToast(first ?? 'กรุณาตรวจฟิลด์ที่จำเป็น');
      return;
    }

    const cost = costText.trim() ? parseNonNegNumber(costText)! : 0;
    const channel = conditionToChannel(condition);
    const warehouseId: WarehouseId =
      warehouses.find((w) => w.channelFocus.includes(channel))?.id ?? 'WH-CTI-MAIN';
    const skuTail = `${Date.now()}`.slice(-6);
    const newSku = `BEV-COPY-${skuTail}`;
    const customFields = collectCustomFields();

    const prepared: VariantInput[] = hasVariants
      ? draftVariants.map((v, i) => ({
          label: v.label.trim() || `ตัวเลือก ${i + 1}`,
          sku: `${newSku}-${i + 1}`,
          price: parseNonNegNumber(v.price)!,
          cost,
          attrs: variantDetailAttrs(v.attrs, { size: v.size, weight: v.weight, note: v.note }),
          warehouseId,
          onHand: 0,
          imageUri: v.imageUri ?? undefined,
        }))
      : [
          {
            label: 'มาตรฐาน',
            sku: `${newSku}-A`,
            price: parseNonNegNumber(priceText)!,
            cost,
            attrs: {},
            warehouseId,
            onHand: 0,
          },
        ];

    const listingPrice = Math.min(...prepared.map((v) => v.price));
    const nextMedia: ProductMediaItem[] = media.length
      ? media.map((item) => ({ ...item }))
      : prepared
          .map((v) => v.imageUri)
          .filter((uri): uri is string => Boolean(uri))
          .map((uri) => ({ uri, type: 'image' as const }));

    setSaving('duplicate');
    const newId = createMasterWithVariants({
      title: title.trim(),
      masterSku: newSku,
      channel,
      basePrice: listingPrice,
      tags: Array.from(new Set([...(master.tags ?? []), channel, 'Shop'])),
      customFields,
      description: description.trim() || undefined,
      usageGuide: usageGuide.trim() || undefined,
      specImages,
      usageImages,
      categoryKey: categoryKey || undefined,
      ownerShopId: master.ownerShopId ?? MY_SHOP_ID,
      brand: master.brand,
      shopName: master.shopName,
      media: nextMedia.length ? nextMedia : undefined,
      variants: prepared,
    });
    onNewProductCreated(MY_WAREHOUSE_ID, newId, categoryKey || undefined);
    setSaving(null);

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('สร้างสินค้าใหม่จากการคัดลอกเรียบร้อยแล้ว');
    allowLeaveRef.current = true;
    hydrateKey.current = null;
    router.replace({ pathname: '/products/[id]/edit', params: { id: newId, copied: '1' } });
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
        <View style={{ marginTop: 14, marginBottom: 4 }}>
          <ProductMediaStrip
            items={media}
            onAdd={openAddGallery}
            onRemove={removeMediaAt}
            onMove={moveMedia}
            onReplace={openReplaceGallery}
            editable={isMine}
          />
        </View>

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

        <FieldLabel>สภาพ</FieldLabel>
        <View style={styles.segmented}>
          {(['new', 'used'] as ProductCondition[]).map((c) => {
            const active = condition === c;
            return (
              <Pressable
                key={c}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => {
                  if (!isMine) return;
                  setCondition(c);
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
        <Text style={styles.hint}>{conditionHint(condition)}</Text>

        <View style={{ marginTop: 12 }}>
          <VariantInventorySection
            hasVariants={hasVariants}
            onToggle={toggleHasVariants}
            variants={draftVariants}
            onPatch={patchVariant}
            onAdd={addVariantRow}
            onRemove={removeVariantRow}
            onBumpVariant={bumpVariantStock}
            onPickPhoto={pickVariantPhoto}
            simplePrice={priceText}
            simpleStock={stockText}
            onSimplePrice={setPriceText}
            onSimpleStock={setStockText}
            onBumpSimple={bumpSimpleStock}
            editable={isMine}
          />
        </View>
        {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}
        {errors.stock ? <Text style={styles.errorText}>{errors.stock}</Text> : null}
        {errors.photo ? <Text style={styles.errorText}>{errors.photo}</Text> : null}

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

        <View style={{ marginTop: 12, marginBottom: 8 }}>
          <SpecRowsEditor
            title="คุณสมบัติ"
            hint="พิมพ์เองได้ทั้งชื่อและค่า เช่น แรงดัน 48V · ความจุใช้กับแบตเตอรี่เท่านั้น"
            rows={specRows}
            onChange={setSpecRows}
            editable={isMine}
          />
        </View>

        <View style={{ marginTop: 8 }}>
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
            editable={isMine}
          />
        </View>

        <View style={{ marginTop: 12 }}>
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
            editable={isMine}
          />
        </View>

        <FieldLabel>รายละเอียดโดยรวม</FieldLabel>
        <TextInput
          style={[styles.input, styles.articleArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="เขียนเป็นบทความได้ เช่น จุดเด่น วัสดุ การรับประกัน และรายละเอียดสินค้า"
          placeholderTextColor={colors.text.muted}
          multiline
          textAlignVertical="top"
          editable={isMine}
        />

        <FieldLabel>วิธีการใช้</FieldLabel>
        <TextInput
          style={[styles.input, styles.articleArea]}
          value={usageGuide}
          onChangeText={setUsageGuide}
          placeholder="เขียนวิธีติดตั้งหรือวิธีใช้เป็นบทความ ใส่รูปขั้นตอนด้านบนได้"
          placeholderTextColor={colors.text.muted}
          multiline
          textAlignVertical="top"
          editable={isMine}
        />

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
          disabled={!!saving}
          accessibilityLabel="ลบสินค้า"
        >
          <Ionicons name="trash-outline" size={18} color="#DC2626" />
        </Pressable>
        <Pressable
          style={[styles.duplicateBtn, saving && { opacity: 0.75 }]}
          onPress={handleSaveAsNew}
          disabled={!!saving}
          accessibilityRole="button"
          accessibilityLabel="บันทึกเป็นสินค้าใหม่"
        >
          {saving === 'duplicate' ? (
            <ActivityIndicator color={colors.brand.primaryDark} />
          ) : (
            <Text style={styles.duplicateBtnText} numberOfLines={2}>
              บันทึกเป็น{'\n'}สินค้าใหม่
            </Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.75 }]}
          onPress={handleSubmit}
          disabled={!!saving}
          accessibilityRole="button"
          accessibilityLabel="บันทึก"
        >
          {saving === 'update' ? (
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

      <BarcodeScannerSheet
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={applyScannedBarcode}
        mode="assign"
      />
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
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
  articleArea: { minHeight: 180, paddingTop: 12, lineHeight: 22 },
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
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#EEF1EF',
    borderRadius: 12,
    padding: 3,
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
  duplicateBtn: {
    flex: 1.15,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand.primaryDark,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duplicateBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.brand.primaryDark,
    textAlign: 'center',
    lineHeight: 16,
  },
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
});
