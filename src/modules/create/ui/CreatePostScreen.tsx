import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useWarehouseStore } from '@/modules/warehouse/state/warehouse-store';
import type { ClonePrefill } from '@/modules/commerce/domain/stock-core';
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
import { colors } from '@/shared/theme/colors';

/** Paste clipboard into form fields (works when iOS long-press paste is flaky). */
async function pasteFromClipboard(
  onChange: (v: string) => void,
  opts?: { appendTo?: string; numeric?: boolean },
) {
  try {
    const raw = await Clipboard.getStringAsync();
    if (!raw?.trim()) {
      Alert.alert('คลิปบอร์ดว่าง', 'คัดลอกข้อความก่อน แล้วกดวางอีกครั้ง');
      return;
    }
    let text = raw;
    if (opts?.numeric) {
      text = raw.replace(/[^\d.]/g, '');
      if (!text) {
        Alert.alert('วางไม่ได้', 'ในคลิปบอร์ดไม่มีตัวเลข');
        return;
      }
      onChange(text);
    } else if (opts?.appendTo && opts.appendTo.length > 0) {
      onChange(`${opts.appendTo}${opts.appendTo.endsWith('\n') ? '' : '\n'}${text}`);
    } else {
      onChange(text);
    }
    void Haptics.selectionAsync();
  } catch {
    Alert.alert('วางไม่สำเร็จ', 'ลองคัดลอกใหม่แล้วกดวางอีกครั้ง');
  }
}

const MAX_PRODUCT_IMAGES = 6;
const MY_WAREHOUSE_ID = 'wh-boom-ev';

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
  const sellOnly = params.mode === 'sell' || Boolean(prefill);
  const [mode, setMode] = useState<'post' | 'sell'>(() => (sellOnly ? 'sell' : 'post'));
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
  const [galleryPurpose, setGalleryPurpose] = useState<'post' | 'sell'>('sell');
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

    const masterId = createMasterWithVariants({
      title: title.trim(),
      masterSku: autoSku,
      channel,
      basePrice: price,
      tags: [conditionLabel(condition), 'Custom', ...(categoryLabel ? [categoryLabel] : [])],
      customFields,
      description: description.trim() || undefined,
      categoryKey,
      imageUris: sellImages.length ? sellImages : undefined,
      variants: [
        {
          label: 'มาตรฐาน',
          sku: `${autoSku}-A`,
          price,
          attrs: {
            voltage: fieldValues.voltage,
            capacityAh: fieldValues.capacityAh ? Number(fieldValues.capacityAh) : undefined,
            color: fieldValues.material,
          },
          warehouseId: wh,
          onHand: stockQty,
        },
      ],
    });

    // Auto-sync: shops subscribed to my warehouse get a listing (per policy)
    const syncedShops = onNewProductCreated(MY_WAREHOUSE_ID, masterId, categoryKey);

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      prefill ? 'คัดลอกสินค้าเรียบร้อย' : 'ลงขายเรียบร้อย',
      [
        prefill
          ? 'สร้างเป็นสินค้าชิ้นใหม่แล้ว ของเดิมไม่เปลี่ยน'
          : `ลงขายเป็น${conditionLabel(condition)} ราคา ฿${price.toLocaleString('th-TH')} · มี ${stockQty} ชิ้น`,
        syncedShops > 0 ? `ร้านที่เชื่อมคลังเห็นสินค้านี้แล้ว ${syncedShops} ร้าน` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    closeAll();
  };

  const sellRemaining = Math.max(0, MAX_PRODUCT_IMAGES - sellImages.length);

  return (
    <>
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
    >
      <View style={styles.header}>
        <Pressable onPress={closeAll}>
          <Text style={styles.cancel}>ปิด</Text>
        </Pressable>
        <Text style={styles.title}>
          {prefill ? 'คัดลอกมาลงขายใหม่' : mode === 'sell' ? 'ลงขายสินค้า' : 'สร้าง'}
        </Text>
        <Pressable onPress={publish}>
          <Text style={styles.publish}>
            {mode === 'sell' ? 'ลงขายเลย' : sellWithClip ? 'โพสต์และขาย' : 'โพสต์'}
          </Text>
        </Pressable>
      </View>

      {prefill ? (
        <View style={styles.cloneBanner}>
          <Ionicons name="happy-outline" size={16} color={colors.accent.info} />
          <Text style={styles.cloneBannerText}>
            คัดลอกจากของเดิมมาให้แล้ว — แก้ชื่อ ราคา จำนวนได้ตามใจ ของเดิมไม่หาย สต็อกเริ่มที่ 0
            ใส่จำนวนใหม่เองนะ
          </Text>
        </View>
      ) : sellOnly ? (
        <View style={styles.cloneBanner}>
          <Ionicons name="bag-handle-outline" size={16} color={colors.brand.primaryDark} />
          <Text style={styles.cloneBannerText}>
            ฟอร์มลงขายสินค้าอย่างเดียว — ไม่ปนกับเว็บบอร์ดหางานหรือคลิปฟีด
          </Text>
        </View>
      ) : null}

      {mode === 'post' ? (
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
      ) : (
        <>
          <Text style={styles.label}>
            1) ใส่รูปสินค้า ({sellImages.length}/{MAX_PRODUCT_IMAGES}) · รูปแรก = รูปปก
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
            style={{ flexGrow: 0, marginBottom: 14 }}
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
                  onPress={() => removeSellImage(uri)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
            {sellImages.length < MAX_PRODUCT_IMAGES ? (
              <Pressable style={styles.addPhotoTile} onPress={pickSellImages}>
                <Ionicons name="camera" size={22} color={colors.text.secondary} />
                <Text style={styles.addPhotoText}>เพิ่มรูป</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </>
      )}

      {mode === 'post' ? (
        <>
          <TextInput
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
              <TextInput
                style={styles.inputSingle}
                placeholder="เช่น แบต 60V (ว่างได้ ใช้แคปชันแทน)"
                placeholderTextColor={colors.text.muted}
                value={postProductName}
                onChangeText={setPostProductName}
              />
              <Text style={styles.label}>ราคา (บาท)</Text>
              <TextInput
                style={styles.inputSingle}
                placeholder="เช่น 1990"
                placeholderTextColor={colors.text.muted}
                value={postPrice}
                onChangeText={setPostPrice}
                keyboardType="numeric"
              />
              <Text style={styles.label}>มีกี่ชิ้น</Text>
              <TextInput
                style={styles.inputSingle}
                placeholder="เช่น 10"
                placeholderTextColor={colors.text.muted}
                value={postStock}
                onChangeText={setPostStock}
                keyboardType="numeric"
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
        <>
          <Text style={styles.label}>2) สภาพสินค้า</Text>
          <View style={styles.row}>
            {(['new', 'used'] as ProductCondition[]).map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, condition === c && styles.chipActive]}
                onPress={() => {
                  setCondition(c);
                  const ch = conditionToChannel(c);
                  const wh = warehouses.find((w) => w.channelFocus.includes(ch));
                  if (wh) setWarehouseId(wh.id);
                  void Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>
                  {conditionLabel(c)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.conditionHint}>{conditionHint(condition)}</Text>

          {categoryLabel ? (
            <View style={styles.categoryHint}>
              <Ionicons name="pricetag" size={13} color={colors.brand.primaryDark} />
              <Text style={styles.categoryHintText}>หมวด: {categoryLabel}</Text>
            </View>
          ) : null}

          <Field
            label="3) ชื่อสินค้า"
            value={title}
            onChange={setTitle}
            placeholder="เช่น แบตมอเตอร์ไซค์ 60V"
            allowPaste
          />

          <View style={styles.labelRow}>
            <Text style={styles.label}>เล่าเกี่ยวกับสินค้า (ไม่บังคับ)</Text>
            <Pressable
              hitSlop={8}
              onPress={() =>
                void pasteFromClipboard(setDescription, { appendTo: description })
              }
              style={styles.pasteBtn}
            >
              <Ionicons name="clipboard-outline" size={14} color={colors.brand.primaryDark} />
              <Text style={styles.pasteBtnText}>วาง</Text>
            </Pressable>
          </View>
          <TextInput
            style={[styles.input, { marginBottom: 10 }]}
            placeholder="ของสภาพไหน ใช้นานแค่ไหน มีประกันไหม... (วางข้อความที่คัดลอกได้)"
            placeholderTextColor={colors.text.muted}
            value={description}
            onChangeText={setDescription}
            multiline
            contextMenuHidden={false}
            textAlignVertical="top"
            autoCorrect
            autoCapitalize="sentences"
            scrollEnabled
          />

          <Field
            label="4) ราคา (บาท)"
            value={basePrice}
            onChange={setBasePrice}
            keyboardType="numeric"
            placeholder="เช่น 1990"
            allowPaste
            pasteNumeric
          />
          <Field
            label="5) มีกี่ชิ้น"
            value={simpleStock}
            onChange={setSimpleStock}
            keyboardType="numeric"
            placeholder={prefill ? 'ใส่จำนวนใหม่ (เริ่มที่ 0)' : 'เช่น 10'}
            allowPaste
            pasteNumeric
          />

          <Text style={styles.easyTip}>
            พอครบแล้วกด “ลงขายเลย” มุมขวาบน — ง่ายๆ แค่นี้
          </Text>
        </>
      )}
    </ScrollView>

    <MediaGalleryPicker
      visible={galleryOpen}
      onClose={() => setGalleryOpen(false)}
      onSend={onGallerySend}
      initialMode={galleryPurpose === 'sell' ? 'photo' : 'photo'}
      allowModeSwitch={galleryPurpose === 'post'}
      selectionLimit={galleryPurpose === 'sell' ? sellRemaining || 1 : 1}
      sendLabel="ส่ง"
      title="ล่าสุด"
    />
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  allowPaste = false,
  pasteNumeric = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  allowPaste?: boolean;
  pasteNumeric?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {allowPaste ? (
          <Pressable
            hitSlop={8}
            onPress={() =>
              void pasteFromClipboard(onChange, {
                appendTo: pasteNumeric ? undefined : value,
                numeric: pasteNumeric,
              })
            }
            style={styles.pasteBtn}
          >
            <Ionicons name="clipboard-outline" size={14} color={colors.brand.primaryDark} />
            <Text style={styles.pasteBtnText}>วาง</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        style={styles.inputSingle}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'numeric' ? 'none' : 'sentences'}
        contextMenuHidden={false}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cancel: { color: colors.text.secondary, fontWeight: '600', fontSize: 16 },
  title: { fontWeight: '900', fontSize: 18, color: colors.text.primary },
  publish: { color: colors.brand.primaryDark, fontWeight: '800', fontSize: 16 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.brand.mist,
    borderWidth: 1,
    borderColor: 'rgba(0,160,110,0.25)',
    marginBottom: 6,
  },
  pasteBtnText: {
    color: colors.brand.primaryDark,
    fontWeight: '800',
    fontSize: 12,
  },
  cloneBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#EAF3FF',
    borderRadius: 14,
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
  modes: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sellToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
    marginBottom: 14,
  },
  sellToggleOn: {
    backgroundColor: colors.brand.mist,
    borderColor: colors.brand.primaryDark,
  },
  sellToggleLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sellToggleTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
  },
  sellToggleTitleOn: {
    color: colors.brand.primaryDark,
  },
  sellToggleHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
    lineHeight: 15,
  },
  sellSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#D5DBD8',
    padding: 2,
    justifyContent: 'center',
  },
  sellSwitchOn: {
    backgroundColor: colors.brand.primaryDark,
  },
  sellKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  sellKnobOn: {
    alignSelf: 'flex-end',
  },
  sellOffNote: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
    lineHeight: 17,
    marginBottom: 8,
  },
  mode: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  modeActive: {
    backgroundColor: colors.brand.ink,
    borderColor: colors.brand.ink,
  },
  modeText: { fontWeight: '700', color: colors.text.secondary },
  modeTextActive: { color: colors.brand.primary },
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
  addField: {
    backgroundColor: colors.brand.mist,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addFieldText: { color: colors.brand.primaryDark, fontWeight: '800' },
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
    marginTop: -4,
    marginBottom: 14,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  easyTip: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 13,
    fontWeight: '700',
    color: colors.brand.primaryDark,
    lineHeight: 18,
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
  variantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  addVariantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.brand.mist,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addVariantText: { color: colors.brand.primaryDark, fontSize: 12, fontWeight: '800' },
  variantCard: {
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    marginBottom: 10,
  },
  variantCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  variantIndex: { fontSize: 11, fontWeight: '800', color: colors.text.muted },
  variantGrid: { flexDirection: 'row', gap: 8 },
});
