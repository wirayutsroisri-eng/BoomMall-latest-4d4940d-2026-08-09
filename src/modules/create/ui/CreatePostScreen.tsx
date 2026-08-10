import React, { useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import type { CommerceChannel, CustomFieldValue, WarehouseId } from '@/modules/commerce/domain/types';
import { colors } from '@/shared/theme/colors';

const MAX_PRODUCT_IMAGES = 6;

export function CreatePostScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; categoryLabel?: string }>();
  const categoryLabel =
    typeof params.categoryLabel === 'string' && params.category !== 'all'
      ? params.categoryLabel
      : undefined;
  const [mode, setMode] = useState<'post' | 'sell'>('sell');
  const [caption, setCaption] = useState('');
  const [postPrice, setPostPrice] = useState('');
  const [postChannel, setPostChannel] = useState<CommerceChannel>('B2C');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [sellImages, setSellImages] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [masterSku, setMasterSku] = useState('BEV-CUSTOM-');
  const [channel, setChannel] = useState<CommerceChannel>('B2C');
  const [basePrice, setBasePrice] = useState('1990');
  const [variantLabel, setVariantLabel] = useState('Default');
  const [variantSku, setVariantSku] = useState('BEV-CUSTOM-001');
  const [onHand, setOnHand] = useState('10');
  const [warehouseId, setWarehouseId] = useState<WarehouseId>('WH-CTI-MAIN');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const warehouses = useInventoryStore((s) => s.warehouses);
  const customFieldDefs = useInventoryStore((s) => s.customFieldDefs);
  const createMasterWithVariants = useInventoryStore((s) => s.createMasterWithVariants);
  const addCustomFieldDef = useInventoryStore((s) => s.addCustomFieldDef);
  const addPost = useFeedStore((s) => s.addPost);

  const ensureLibraryPermission = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์เข้าถึงคลังภาพ', 'กรุณาอนุญาตให้ BoomMall เข้าถึงรูปภาพ/วิดีโอในเครื่อง');
      return false;
    }
    return true;
  };

  const pickMedia = async () => {
    if (!(await ensureLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const pickSellImages = async () => {
    const remaining = MAX_PRODUCT_IMAGES - sellImages.length;
    if (remaining <= 0) {
      Alert.alert('รูปครบแล้ว', `ลงได้สูงสุด ${MAX_PRODUCT_IMAGES} รูปต่อสินค้า`);
      return;
    }
    if (!(await ensureLibraryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length) {
      setSellImages((prev) =>
        [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_PRODUCT_IMAGES),
      );
      void Haptics.selectionAsync();
    }
  };

  const removeSellImage = (uri: string) => {
    setSellImages((prev) => prev.filter((u) => u !== uri));
  };

  const channelWarehouses = useMemo(
    () => warehouses.filter((w) => w.channelFocus.includes(channel)),
    [warehouses, channel],
  );

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
      addPost({
        caption: caption.trim(),
        price: Number(postPrice) || 0,
        channel: postChannel,
        imageUri: mediaType === 'image' ? mediaUri ?? undefined : undefined,
        videoUri: mediaType === 'video' ? mediaUri ?? undefined : undefined,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('โพสต์สำเร็จ', 'คอนเทนต์ของคุณขึ้นบนสุดของ Home Feed แล้ว');
      closeAll();
      return;
    }

    if (!title.trim() || !masterSku.trim()) {
      Alert.alert('กรอกไม่ครบ', 'ต้องมีชื่อสินค้าและ Master SKU');
      return;
    }
    const price = Number(basePrice);
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert('ราคาไม่ถูกต้อง', 'กรุณากรอกราคาฐานเป็นตัวเลขมากกว่า 0');
      return;
    }
    const stock = Number(onHand);
    if (!Number.isFinite(stock) || stock < 0) {
      Alert.alert('สต็อกไม่ถูกต้อง', 'กรุณากรอกจำนวนสต็อกเริ่มต้นเป็นตัวเลข 0 ขึ้นไป');
      return;
    }

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

    createMasterWithVariants({
      title: title.trim(),
      masterSku: masterSku.trim(),
      channel,
      basePrice: price,
      tags: [channel, 'Custom', ...(categoryLabel ? [categoryLabel] : [])],
      customFields,
      description: description.trim() || undefined,
      imageUris: sellImages.length ? sellImages : undefined,
      variants: [
        {
          label: variantLabel.trim() || 'Default',
          sku: variantSku.trim(),
          price,
          attrs: {
            voltage: fieldValues.voltage,
            capacityAh: fieldValues.capacityAh ? Number(fieldValues.capacityAh) : undefined,
            color: fieldValues.material,
          },
          warehouseId,
          onHand: stock,
        },
      ],
    });

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('ลงขายสำเร็จ', 'สร้าง Master SKU + Variant + Warehouse Stock แล้ว');
    closeAll();
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={closeAll}>
          <Text style={styles.cancel}>ปิด</Text>
        </Pressable>
        <Text style={styles.title}>สร้าง</Text>
        <Pressable onPress={publish}>
          <Text style={styles.publish}>{mode === 'sell' ? 'ลงขาย' : 'โพสต์'}</Text>
        </Pressable>
      </View>

      <View style={styles.modes}>
        <Pressable
          style={[styles.mode, mode === 'post' && styles.modeActive]}
          onPress={() => setMode('post')}
        >
          <Text style={[styles.modeText, mode === 'post' && styles.modeTextActive]}>โพสต์คลิป</Text>
        </Pressable>
        <Pressable
          style={[styles.mode, mode === 'sell' && styles.modeActive]}
          onPress={() => setMode('sell')}
        >
          <Text style={[styles.modeText, mode === 'sell' && styles.modeTextActive]}>
            ลงขายสินค้า
          </Text>
        </Pressable>
      </View>

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
            รูปสินค้า ({sellImages.length}/{MAX_PRODUCT_IMAGES}) · รูปแรกคือรูปปก
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
                <Ionicons name="camera" size={22} color={colors.brand.primaryDark} />
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
          <Text style={styles.label}>ตั้งราคา (ไม่บังคับ)</Text>
          <TextInput
            style={styles.inputSingle}
            placeholder="เช่น 1990"
            placeholderTextColor={colors.text.muted}
            value={postPrice}
            onChangeText={setPostPrice}
            keyboardType="numeric"
          />
          <Text style={styles.label}>ร้านค้า / ช่องทางขาย</Text>
          <View style={styles.row}>
            {(['B2B', 'B2C', 'C2C'] as CommerceChannel[]).map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, postChannel === c && styles.chipActive]}
                onPress={() => setPostChannel(c)}
              >
                <Text style={[styles.chipText, postChannel === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>ช่องทางขาย</Text>
          <View style={styles.row}>
            {(['B2B', 'B2C', 'C2C'] as CommerceChannel[]).map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, channel === c && styles.chipActive]}
                onPress={() => {
                  setChannel(c);
                  const wh = warehouses.find((w) => w.channelFocus.includes(c));
                  if (wh) setWarehouseId(wh.id);
                }}
              >
                <Text style={[styles.chipText, channel === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {categoryLabel ? (
            <View style={styles.categoryHint}>
              <Ionicons name="pricetag" size={13} color={colors.brand.primaryDark} />
              <Text style={styles.categoryHintText}>ลงในหมวดหมู่: {categoryLabel}</Text>
            </View>
          ) : null}

          <Field label="ชื่อสินค้า" value={title} onChange={setTitle} placeholder="เช่น แบต 60V 32Ah" />

          <Text style={styles.label}>รายละเอียดสินค้า</Text>
          <TextInput
            style={[styles.input, { marginBottom: 10 }]}
            placeholder="อธิบายสินค้า จุดเด่น สภาพ การรับประกัน..."
            placeholderTextColor={colors.text.muted}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Field label="Master SKU" value={masterSku} onChange={setMasterSku} />
          <Field
            label="ราคาฐาน (THB)"
            value={basePrice}
            onChange={setBasePrice}
            keyboardType="numeric"
          />
          <Field label="Variant Label" value={variantLabel} onChange={setVariantLabel} />
          <Field label="Variant SKU" value={variantSku} onChange={setVariantSku} />
          <Field
            label="สต็อกเริ่มต้น"
            value={onHand}
            onChange={setOnHand}
            keyboardType="numeric"
          />

          <Text style={styles.label}>คลังสินค้า (Multi-Warehouse)</Text>
          <View style={styles.row}>
            {channelWarehouses.map((w) => (
              <Pressable
                key={w.id}
                style={[styles.chip, warehouseId === w.id && styles.chipActive]}
                onPress={() => setWarehouseId(w.id)}
              >
                <Text
                  style={[styles.chipText, warehouseId === w.id && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {w.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Custom Fields</Text>
          {customFieldDefs.map((def) => (
            <Field
              key={def.key}
              label={`${def.label}${def.required ? ' *' : ''}`}
              value={fieldValues[def.key] ?? ''}
              onChange={(v) => setFieldValues((prev) => ({ ...prev, [def.key]: v }))}
              placeholder={def.options?.join(' / ') ?? def.type}
              keyboardType={def.type === 'number' ? 'numeric' : 'default'}
            />
          ))}

          <Text style={styles.label}>เพิ่มฟิลด์ใหม่ (Customize อิสระ)</Text>
          <Field label="Field Key" value={newFieldKey} onChange={setNewFieldKey} placeholder="e.g. cellBrand" />
          <Field label="Field Label" value={newFieldLabel} onChange={setNewFieldLabel} placeholder="ยี่ห้อเซลล์" />
          <Pressable
            style={styles.addField}
            onPress={() => {
              if (!newFieldKey.trim() || !newFieldLabel.trim()) return;
              addCustomFieldDef({
                key: newFieldKey.trim(),
                label: newFieldLabel.trim(),
                type: 'text',
              });
              setNewFieldKey('');
              setNewFieldLabel('');
              Alert.alert('เพิ่มฟิลด์แล้ว', 'ใช้ได้ทันทีในฟอร์มนี้');
            }}
          >
            <Text style={styles.addFieldText}>+ เพิ่ม Custom Field</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.inputSingle}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        keyboardType={keyboardType}
        autoCapitalize="none"
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
  modes: { flexDirection: 'row', gap: 8, marginBottom: 14 },
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
    borderColor: colors.brand.primaryDark,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { color: colors.brand.primaryDark, fontSize: 11, fontWeight: '800' },
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
