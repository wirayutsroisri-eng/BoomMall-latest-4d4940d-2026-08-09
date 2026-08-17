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
import * as Haptics from 'expo-haptics';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { DEFAULT_OVERLAY_TRANSFORM } from '@/modules/create/domain/overlay';
import { persistCreateMedia } from '@/modules/create/data/persistCreateMedia';
import { pickDevicePhotos } from '@/shared/media/photoLibraryStore';
import { useCreateDraftStore } from '@/modules/create/state/create-draft-store';
import { sanitizeMusicTitle } from '@/modules/feed/domain/feedMusic';
import { LockedOverlayText } from '@/modules/create/ui/LockedOverlayText';
import { ProductVideoThumb } from '@/modules/store/ui/sell/ProductVideoThumb';
import { colors } from '@/shared/theme/colors';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { scanKeywordsOnServer } from '@/modules/safety/syncModerationContentBlocks';

const LOCATION_CHIPS = [
  'โรงแรม มณีจันทร์รีสอร์ท',
  'เมืองจันทบุรี',
  'จันทบุรี',
  'เขาคิชฌกูฏ',
];

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
};

function OptionRow({ icon, title, subtitle, onPress, trailing }: RowProps) {
  return (
    <Pressable style={styles.optionRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.text.primary} />
      <View style={styles.optionBody}>
        <Text style={styles.optionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.optionSub}>{subtitle}</Text> : null}
      </View>
      {trailing ?? <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />}
    </Pressable>
  );
}

/**
 * Final TikTok-style publish form — cover 3:4, title, description, location, link, draft/post.
 * Content-only (product via optional "เพิ่มลิงก์").
 */
export function ContentPublishScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    uri?: string;
    type?: string;
  }>();
  const addPost = useFeedStore((s) => s.addPost);
  const draft = useCreateDraftStore();
  const clearDraft = useCreateDraftStore((s) => s.clear);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUser = useAuthStore((s) => s.user);
  const hideContent = useModerationStore((s) => s.hideContent);

  const initialUri =
    draft.uri || (typeof params.uri === 'string' ? params.uri : null);
  const overlayText = draft.overlayText;
  const overlayColor = draft.overlayColor;
  const overlayTransform = draft.overlayTransform ?? DEFAULT_OVERLAY_TRANSFORM;
  /** bake แล้ว = รูปมีข้อความในพิกเซลแล้ว — ไม่ซ้อน overlay อีก */
  const showLiveOverlay = !draft.baked && !!overlayText.trim();

  const [mediaUris, setMediaUris] = useState<string[]>(
    initialUri ? [initialUri] : [],
  );
  const [title, setTitle] = useState(overlayText || '');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<string | null>(null);
  const [privacy] = useState('ทุกคนสามารถดูโพสต์นี้ได้');
  const [linkLabel, setLinkLabel] = useState<string | null>(null);

  const coverUri = mediaUris[0] ?? null;
  const mediaType =
    draft.type === 'video' || params.type === 'video' ? 'video' : 'image';
  const remainingSlots = Math.max(0, 6 - mediaUris.length);

  const closeAll = () => {
    useFeedStore.getState().setTab('foryou');
    if (router.canDismiss()) router.dismissAll();
    router.navigate('/(tabs)');
  };

  const addFromLibrary = async () => {
    if (remainingSlots <= 0) return;
    try {
      const items = await pickDevicePhotos({
        selectionLimit: remainingSlots,
        videos: mediaType === 'video',
        videosOnly: mediaType === 'video',
        title: 'เพิ่มสื่อ',
        sendLabel: 'เพิ่ม',
      });
      if (!items.length) return;
      const next: string[] = [];
      for (const item of items) {
        next.push(
          await persistCreateMedia(
            item.uri,
            item.mediaType === 'video' ? 'video' : 'image',
          ),
        );
      }
      setMediaUris((prev) => [...prev, ...next].slice(0, 6));
      void Haptics.selectionAsync();
    } catch (e) {
      Alert.alert('เปิดแกลเลอรีไม่ได้', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    }
  };

  const publish = (asDraft: boolean) => {
    if (!isAuthenticated()) {
      Alert.alert('ต้องเข้าสู่ระบบ', 'โพสต์คอนเทนต์ได้เฉพาะบัญชีโซเชียลเท่านั้น');
      return;
    }
    if (!coverUri) {
      Alert.alert('ยังไม่มีรูปปก', 'กลับไปเลือกรูปก่อนโพสต์');
      return;
    }
    if (asDraft) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('บันทึกร่างแล้ว', 'เปิดต่อได้จากคลังร่างในภายหลัง');
      closeAll();
      return;
    }

    const musicTitle = sanitizeMusicTitle(draft.music);
    const captionParts = [
      title.trim(),
      description.trim(),
      location ? `📍 ${location}` : null,
      linkLabel ? `🔗 ${linkLabel}` : null,
      musicTitle ? `🎵 ${musicTitle}` : null,
    ].filter(Boolean);
    const caption = captionParts.join('\n') || 'โพสต์ใหม่จาก BoomMall';

    const postId = addPost({
      caption,
      price: 0,
      channel: 'C2C',
      imageUri: mediaType === 'image' ? coverUri : undefined,
      imageUris: mediaType === 'image' ? mediaUris : undefined,
      videoUri: mediaType === 'video' ? coverUri : undefined,
      musicTitle: musicTitle || undefined,
      intent: 'content',
      // ภาพ bake แล้วไม่ส่ง overlay — วิดีโอ/legacy ยังใช้ live overlay
      ...(showLiveOverlay
        ? {
            overlayText,
            overlayTextColor: overlayColor,
            overlayTransform,
          }
        : {}),
    });

    void (async () => {
      const result = await scanKeywordsOnServer({
        contentId: postId,
        text: caption,
        authorUserId: authUser?.id,
        authorHandle: authUser?.handle,
      });
      if (result?.quarantined) {
        hideContent(postId);
        Alert.alert(
          'รอตรวจสอบ',
          'โพสต์มีคำที่เสี่ยง — เข้าคิว Pending Review ก่อนขึ้นฟีดหลัก',
        );
      }
    })();

    clearDraft();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeAll();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>พรีวิว</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.coverRow}
        >
          {mediaUris.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.coverTile}>
              {mediaType === 'video' ? (
                <ProductVideoThumb
                  uri={uri}
                  autoPlay={index === 0}
                  muted
                  interactive={false}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
              {index === 0 && showLiveOverlay ? (
                <LockedOverlayText
                  text={overlayText}
                  color={overlayColor}
                  transform={overlayTransform}
                  fontSize={14}
                />
              ) : null}
              {index === 0 ? (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>ปก</Text>
                </View>
              ) : null}
            </View>
          ))}
          {mediaUris.length < 6 ? (
            <Pressable style={styles.addTile} onPress={() => void addFromLibrary()}>
              <Ionicons name="add" size={32} color={colors.text.primary} />
            </Pressable>
          ) : null}
        </ScrollView>

        <TextInput
          style={styles.titleInput}
          placeholder="เพิ่มชื่อที่โดนใจ"
          placeholderTextColor={colors.text.muted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.descInput}
          placeholder="การเขียนคำอธิบายแบบยาวสามารถช่วยเพิ่มยอดดูได้โดยเฉลี่ยถึง 3 เท่า"
          placeholderTextColor={colors.text.muted}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <View style={styles.utilRow}>
          <Pressable
            style={styles.utilBtn}
            onPress={() => setDescription((d) => `${d}${d ? ' ' : ''}#BoomMall `)}
          >
            <Text style={styles.utilGlyph}>#</Text>
          </Pressable>
          <Pressable
            style={styles.utilBtn}
            onPress={() => setDescription((d) => `${d}${d ? ' ' : ''}@`)}
          >
            <Text style={styles.utilGlyph}>@</Text>
          </Pressable>
          <Pressable
            style={styles.utilBtn}
            onPress={() =>
              setDescription(
                (d) =>
                  d ||
                  'รีวิวของดีจากจันทบุรี 🔧⚡ ดูคลิปจบแล้วทักแชทได้เลย',
              )
            }
          >
            <Ionicons name="sparkles" size={18} color={colors.text.primary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Ionicons name="expand-outline" size={20} color={colors.text.muted} />
        </View>

        <View style={styles.divider} />

        <View style={styles.locationBlock}>
          <View style={styles.locationHeader}>
            <Ionicons name="location-outline" size={20} color={colors.text.primary} />
            <Text style={styles.optionTitle}>ตำแหน่งที่ตั้ง</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {LOCATION_CHIPS.map((chip) => {
              const active = location === chip;
              return (
                <Pressable
                  key={chip}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setLocation(active ? null : chip)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {chip}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.divider} />

        <OptionRow
          icon="film-outline"
          title="การเผยแพร่เนื้อหาและโฆษณา"
          onPress={() => Alert.alert('การเผยแพร่', 'ตั้งค่าการเผยแพร่และโฆษณา')}
        />
        <OptionRow
          icon="add-outline"
          title="เพิ่มลิงก์"
          subtitle={linkLabel ?? 'ลิงก์ภายนอก (ไม่ใช่ลงขายสินค้า)'}
          onPress={() =>
            Alert.alert('เพิ่มลิงก์', undefined, [
              {
                text: 'ลิงก์ทั่วไป',
                onPress: () => setLinkLabel('ลิงก์ในโพสต์'),
              },
              {
                text: 'ลิงก์ภายนอก',
                onPress: () => setLinkLabel('ลิงก์ภายนอก'),
              },
              { text: 'ยกเลิก', style: 'cancel' },
            ])
          }
        />
        <OptionRow
          icon="earth-outline"
          title={privacy}
          onPress={() => Alert.alert('ความเป็นส่วนตัว', privacy)}
        />
        <OptionRow
          icon="settings-outline"
          title="ตัวเลือกเพิ่มเติม"
          onPress={() => Alert.alert('ตัวเลือกเพิ่มเติม', 'อนุญาตคอมเมนต์ / ดูยอดถูกใจ ฯลฯ')}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.draftBtn} onPress={() => publish(true)}>
          <Ionicons name="folder-open-outline" size={18} color={colors.text.primary} />
          <Text style={styles.draftText}>ร่าง</Text>
        </Pressable>
        <Pressable style={styles.postBtn} onPress={() => publish(false)}>
          <View style={styles.postIcon}>
            <Ionicons name="arrow-up" size={14} color="#fff" />
          </View>
          <Text style={styles.postText}>โพสต์</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text.primary,
  },
  coverRow: {
    paddingHorizontal: 16,
    gap: 10,
    paddingTop: 8,
    paddingBottom: 16,
  },
  /** 9:16 เหมือนหน้าแต่ง/ฟีด — ให้ครอปรูปกับตำแหน่งข้อความตรงกัน */
  coverTile: {
    width: 96,
    height: 170,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ddd',
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
  },
  coverBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  addTile: {
    width: 96,
    height: 170,
    borderRadius: 10,
    backgroundColor: '#E8EAE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInput: {
    marginHorizontal: 16,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 8,
  },
  descInput: {
    marginHorizontal: 16,
    minHeight: 72,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  utilRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  utilBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8EAE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilGlyph: {
    fontWeight: '900',
    fontSize: 16,
    color: colors.text.primary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.strong,
    marginVertical: 8,
  },
  locationBlock: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chipRow: { gap: 8 },
  chip: {
    maxWidth: 160,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E8EAE9',
  },
  chipActive: {
    backgroundColor: colors.brand.mist,
    borderWidth: 1,
    borderColor: colors.brand.primaryDark,
  },
  chipText: {
    color: colors.text.secondary,
    fontWeight: '700',
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.brand.primaryDark,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  optionBody: { flex: 1, gap: 2 },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  optionSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: colors.surface.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E8EAE9',
    borderRadius: 10,
    paddingVertical: 14,
  },
  draftText: {
    fontWeight: '800',
    fontSize: 15,
    color: colors.text.primary,
  },
  postBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent.live,
    borderRadius: 10,
    paddingVertical: 14,
  },
  postIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
});
