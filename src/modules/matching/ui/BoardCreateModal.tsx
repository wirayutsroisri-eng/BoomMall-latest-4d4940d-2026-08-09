import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import type { BoardSide } from '@/modules/feed/domain/types';
import { CHANTHABURI } from '@/modules/matching/domain/geo';
import { SKILL_KEYWORDS } from '@/modules/matching/domain/skills-map';
import {
  DEFAULT_SEARCH_RADIUS,
  type SearchRadiusOption,
} from '@/modules/matching/domain/search-radius';
import { SearchRadiusSlider } from '@/modules/matching/ui/SearchRadiusSlider';
import { useBoardUiStore } from '@/modules/matching/state/board-ui-store';
import {
  MediaGalleryPicker,
  type PickedGalleryItem,
} from '@/shared/media/MediaGalleryPicker';
import { colors } from '@/shared/theme/colors';

const CATEGORIES = SKILL_KEYWORDS.slice(0, 10);

/**
 * Community Board create modal — demand/supply form + interactive radius slider.
 */
export function BoardCreateModal() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ side?: string; locked?: string }>();
  const storeSide = useBoardUiStore((s) => s.side);
  const setStoreSide = useBoardUiStore((s) => s.setSide);
  const addPost = useFeedStore((s) => s.addPost);

  const initialSide: BoardSide =
    params.side === 'supply' || params.side === 'demand' ? params.side : storeSide;
  /** Hub / board FAB already chose context — don't let users flip into the other form. */
  const sideLocked = params.locked === '1' || params.side === 'demand' || params.side === 'supply';

  const [side, setSide] = useState<BoardSide>(initialSide);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [budget, setBudget] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0] ?? 'ตัดหญ้า');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [searchRadius, setSearchRadius] = useState<SearchRadiusOption>(DEFAULT_SEARCH_RADIUS);
  const [submitting, setSubmitting] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const caption = useMemo(() => {
    const head =
      side === 'demand'
        ? `หาคน${category}${title.trim() ? ` — ${title.trim()}` : ''}`
        : `รับ${category}${title.trim() ? ` — ${title.trim()}` : ''}`;
    return details.trim() ? `${head}\n${details.trim()}` : head;
  }, [side, category, title, details]);

  const pickPhoto = () => setGalleryOpen(true);

  const onGallerySend = (items: PickedGalleryItem[]) => {
    setGalleryOpen(false);
    const first = items.find((i) => i.mediaType === 'photo') ?? items[0];
    if (!first) return;
    setImageUri(first.uri);
    void Haptics.selectionAsync();
  };

  const onSubmit = () => {
    if (!title.trim() && !details.trim()) {
      Alert.alert('กรอกข้อมูล', 'ใส่หัวข้อหรือรายละเอียดอย่างน้อย 1 อย่าง');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStoreSide(side);
    const price = Math.max(0, Math.trunc(Number(budget.replace(/,/g, '')) || 0));
    addPost({
      caption,
      price,
      channel: 'C2C',
      imageUri,
      gps: CHANTHABURI,
      searchRadius,
      boardSide: side,
      productName: title.trim() || category,
      forceBoard: true,
      intent: 'board',
    });
    router.back();
    setTimeout(() => {
      Alert.alert(
        side === 'demand' ? 'ประกาศหางานแล้ว' : 'ลงบัตรรับงานแล้ว',
        side === 'demand'
          ? `บูมบอทกำลังสแกนผู้ให้บริการในรัศมี ${searchRadius === 'all' ? 'ทั้งพื้นที่' : `${searchRadius} กม.`}`
          : 'บัตรของคุณพร้อมให้ระบบจับคู่เมื่อมีโพสต์หาช่างใกล้เคียง',
      );
    }, 350);
  };

  const headerTitle = side === 'demand' ? 'ประกาศหางาน / หาช่าง' : 'รับงาน / เสนอบริการ';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <Pressable onPress={onSubmit} disabled={submitting}>
          <Text style={styles.publish}>โพสต์</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {sideLocked ? (
          <View style={styles.contextBanner}>
            <Ionicons
              name={side === 'demand' ? 'construct-outline' : 'briefcase-outline'}
              size={18}
              color={colors.brand.primaryDark}
            />
            <Text style={styles.contextBannerText}>
              {side === 'demand'
                ? 'ฟอร์มประกาศหางาน — ไม่ใช่ลงขายสินค้าหรือคลิปฟีด'
                : 'ฟอร์มบัตรรับงาน — ไม่ใช่ลงขายสินค้าหรือคลิปฟีด'}
            </Text>
          </View>
        ) : (
          <View style={styles.sideRow}>
            {(
              [
                { key: 'demand', label: 'หาช่าง/หาคนช่วย' },
                { key: 'supply', label: 'รับงาน/เสนอบริการ' },
              ] as const
            ).map((tab) => {
              const active = side === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.sideChip, active && styles.sideChipActive]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSide(tab.key);
                  }}
                >
                  <Text style={[styles.sideChipText, active && styles.sideChipTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable style={styles.photoBox} onPress={pickPhoto}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="image-outline" size={28} color={colors.text.muted} />
              <Text style={styles.photoHint}>
                {side === 'demand' ? 'แนบรูปร่องรอยงาน (ถ้ามี)' : 'แนบรูปผลงาน / โปรไฟล์บริการ'}
              </Text>
            </View>
          )}
        </Pressable>

        <Field label="หัวข้อ">
          <TextInput
            style={styles.input}
            placeholder={side === 'demand' ? 'เช่น ตัดกอไผ่หน้าบ้าน' : 'เช่น รับตัดหญ้า'}
            placeholderTextColor={colors.text.muted}
            value={title}
            onChangeText={setTitle}
          />
        </Field>

        <Field label="รายละเอียด">
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="รายละเอียดงาน / พื้นที่ / เวลาที่สะดวก"
            placeholderTextColor={colors.text.muted}
            value={details}
            onChangeText={setDetails}
            multiline
          />
        </Field>

        <Field label="งบประมาณ / ค่าบริการ (บาท)">
          <TextInput
            style={styles.input}
            placeholder="เช่น 1500"
            placeholderTextColor={colors.text.muted}
            keyboardType="number-pad"
            value={budget}
            onChangeText={setBudget}
          />
        </Field>

        <Field label="หมวด / ทักษะ">
          <View style={styles.catRow}>
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <Pressable
                  key={c}
                  style={[styles.catChip, active && styles.catChipActive]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setCategory(c);
                  }}
                >
                  <Text style={[styles.catText, active && styles.catTextActive]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <SearchRadiusSlider value={searchRadius} onChange={setSearchRadius} />
      </ScrollView>

      <MediaGalleryPicker
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSend={onGallerySend}
        initialMode="photo"
        allowModeSwitch={false}
        selectionLimit={1}
        sendLabel="ส่ง"
        title="ล่าสุด"
      />
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  headerTitle: {
    fontWeight: '900',
    fontSize: 16,
    color: colors.text.primary,
  },
  publish: {
    fontWeight: '900',
    fontSize: 15,
    color: colors.brand.primaryDark,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brand.mist,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  contextBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.primaryDark,
    lineHeight: 17,
  },
  sideRow: { flexDirection: 'row', gap: 8 },
  sideChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(10,22,17,0.06)',
    alignItems: 'center',
  },
  sideChipActive: { backgroundColor: colors.brand.ink },
  sideChipText: { fontWeight: '800', fontSize: 12, color: colors.text.secondary },
  sideChipTextActive: { color: colors.brand.primary },
  photoBox: {
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoHint: { color: colors.text.muted, fontSize: 12, fontWeight: '600' },
  field: { gap: 6 },
  fieldLabel: { fontWeight: '800', fontSize: 13, color: colors.text.primary },
  input: {
    backgroundColor: colors.surface.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  textarea: { minHeight: 88, textAlignVertical: 'top' },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  catChipActive: {
    backgroundColor: colors.brand.mist,
    borderColor: colors.brand.primaryDark,
  },
  catText: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  catTextActive: { color: colors.brand.primaryDark },
});
