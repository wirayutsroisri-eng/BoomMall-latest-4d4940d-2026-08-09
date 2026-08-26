import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { persistCreateMedia } from '@/modules/create/data/persistCreateMedia';
import { pickDevicePhotos } from '@/shared/media/photoLibraryStore';
import { useCreateDraftStore } from '@/modules/create/state/create-draft-store';
import { sanitizeMusicTitle } from '@/modules/feed/domain/feedMusic';
import { TextOverlayRenderer } from '@/modules/create/ui/TextOverlayRenderer';
import { LockedStickerOverlay } from '@/modules/create/ui/LockedStickerOverlay';
import {
  makeEditorMedia,
  type TextOverlayObject,
  type StickerOverlayObject,
} from '@/modules/create/domain/editorComposition';

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

const TITLE_INPUT_MIN = 44;
const TITLE_INPUT_MAX = 120;
const DESC_INPUT_MIN = 72;
const DESC_INPUT_MAX = 220;

function estimateInputHeight(
  text: string,
  lineHeight: number,
  minHeight: number,
  maxHeight: number,
) {
  if (!text.trim()) return minHeight;
  let lines = 0;
  for (const row of text.split('\n')) {
    lines += Math.max(1, Math.ceil(row.length / 34));
  }
  return Math.min(maxHeight, Math.max(minHeight, lines * lineHeight + 8));
}

function GrowingTextInput({
  minHeight,
  maxHeight,
  lineHeight = 20,
  style,
  value,
  ...rest
}: TextInputProps & { minHeight: number; maxHeight: number; lineHeight?: number }) {
  const [height, setHeight] = useState(() =>
    estimateInputHeight(String(value ?? ''), lineHeight, minHeight, maxHeight),
  );

  useEffect(() => {
    setHeight(estimateInputHeight(String(value ?? ''), lineHeight, minHeight, maxHeight));
  }, [lineHeight, maxHeight, minHeight, value]);

  const onContentSizeChange = useCallback(
    (event: { nativeEvent: { contentSize: { height: number } } }) => {
      const next = Math.ceil(event.nativeEvent.contentSize.height);
      setHeight(Math.min(maxHeight, Math.max(minHeight, next)));
    },
    [maxHeight, minHeight],
  );

  return (
    <TextInput
      {...rest}
      value={value}
      multiline
      scrollEnabled={height >= maxHeight}
      onContentSizeChange={onContentSizeChange}
      style={[style, { height }]}
    />
  );
}

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
  const updatePost = useFeedStore((s) => s.updatePost);
  const draft = useCreateDraftStore();
  const clearDraft = useCreateDraftStore((s) => s.clear);
  const setMedia = useCreateDraftStore((s) => s.setMedia);
  const setOverlays = useCreateDraftStore((s) => s.setOverlays);
  const editFeedId = useCreateDraftStore((s) => s.editFeedId);
  const isEditing = Boolean(editFeedId);
  const authenticated = useAuthStore((s) => Boolean(s.sessionToken && s.user));
  const authUser = useAuthStore((s) => s.user);
  const hideContent = useModerationStore((s) => s.hideContent);

  const initialUri =
    draft.uri || (typeof params.uri === 'string' ? params.uri : null);
  useEffect(() => {
    if (!draft.media.length && initialUri) {
      setMedia([makeEditorMedia(initialUri, draft.type)]);
    }
  }, [draft.media.length, draft.type, initialUri, setMedia]);

  const mediaItems = draft.media;
  const mediaUris = mediaItems.map((item) => item.uri);
  const [title, setTitle] = useState(draft.publishTitle || '');
  const [description, setDescription] = useState(draft.publishDescription || '');
  const [location, setLocation] = useState<string | null>(draft.publishLocation);
  const [privacy] = useState('ทุกคนสามารถดูโพสต์นี้ได้');
  const [linkLabel, setLinkLabel] = useState<string | null>(draft.publishLinkLabel);
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const clientPostIdRef = useRef<string | null>(null);

  const coverUri = mediaUris[0] ?? null;
  const mediaType =
    draft.type === 'video' || params.type === 'video' ? 'video' : 'image';
  const remainingSlots = Math.max(0, 6 - mediaUris.length);

  const closeAll = () => {
    useFeedStore.getState().setTab('foryou');
    // One atomic stack action. Calling dismissAll() and navigate() back-to-back
    // can race the native iOS modal transition and leave create-publish visible.
    router.dismissTo('/(tabs)');
  };

  const addFromLibrary = async () => {
    if (remainingSlots <= 0) {
      Alert.alert('ครบแล้ว', 'เพิ่มได้สูงสุด 6 รูป');
      return;
    }
    try {
      const items = await pickDevicePhotos({
        selectionLimit: remainingSlots,
        videos: mediaType === 'video',
        videosOnly: mediaType === 'video',
        title: mediaType === 'video' ? 'เลือกวิดีโอ' : 'เพิ่มจากคลังภาพ',
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
      const appended = next.map((uri) => makeEditorMedia(uri, mediaType));
      setMedia([...mediaItems, ...appended].slice(0, 6));
      void Haptics.selectionAsync();
    } catch (e) {
      Alert.alert('เปิดแกลเลอรีไม่ได้', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    }
  };

  const replaceMediaAt = async (index: number) => {
    const target = mediaItems[index];
    if (!target) return;
    try {
      const items = await pickDevicePhotos({
        selectionLimit: 1,
        videos: target.type === 'video',
        videosOnly: target.type === 'video',
        title: target.type === 'video' ? 'เปลี่ยนวิดีโอ' : 'เปลี่ยนรูป',
        sendLabel: 'เลือก',
      });
      const picked = items[0];
      if (!picked?.uri) return;
      const uri = await persistCreateMedia(
        picked.uri,
        target.type === 'video' ? 'video' : 'image',
      );
      setMedia(mediaItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, uri, width: undefined, height: undefined } : item,
      ));
      setOverlays(draft.overlays.filter((overlay) => overlay.mediaId !== target.id));
      void Haptics.selectionAsync();
    } catch (error) {
      Alert.alert('เปลี่ยนสื่อไม่ได้', error instanceof Error ? error.message : 'ลองอีกครั้ง');
    }
  };

  const openPreviewActions = (index: number) => {
    const target = mediaItems[index];
    if (!target) return;
    Alert.alert('แก้ไขสื่อ', undefined, [
      { text: 'เปลี่ยนรูป/วิดีโอ', onPress: () => void replaceMediaAt(index) },
      {
        text: 'แต่งเพิ่ม',
        onPress: () => router.push({
          pathname: target.type === 'image' ? '/create-editor' : '/create-preview',
          params: { type: target.type, edit: '1', mediaId: target.id },
        }),
      },
      { text: 'ยกเลิก', style: 'cancel' },
    ]);
  };

  const publish = async (asDraft: boolean) => {
    if (!authenticated) {
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
    if (publishingRef.current) return;
    publishingRef.current = true;
    clientPostIdRef.current ??= Crypto.randomUUID();
    setPublishing(true);
    console.info('[POST_FLOW] 01 start', { mediaCount: mediaUris.length, mediaType });

    const musicTitle = sanitizeMusicTitle(draft.music);
    const captionParts = [
      title.trim(),
      description.trim(),
      location ? `📍 ${location}` : null,
      linkLabel ? `🔗 ${linkLabel}` : null,
      musicTitle ? `🎵 ${musicTitle}` : null,
    ].filter(Boolean);
    const caption = captionParts.join('\n');

    const postPayload = {
      caption,
      price: 0,
      channel: 'C2C' as const,
      imageUri: mediaType === 'image' ? coverUri : undefined,
      imageUris: mediaType === 'image' ? mediaUris : undefined,
      videoUri: mediaType === 'video' ? coverUri : undefined,
      musicTitle: musicTitle || undefined,
      intent: 'content' as const,
      locationLabel: location ?? undefined,
      editorMedia: mediaItems,
      overlays: draft.overlays,
    };

    let succeeded = false;
    try {
    if (isEditing && editFeedId) {
      const ok = await updatePost(editFeedId, postPayload);
      if (!ok) {
        Alert.alert('แก้ไขไม่ได้', 'ไม่พบโพสต์ของคุณ');
        return;
      }
      void (async () => {
        const result = await scanKeywordsOnServer({
          contentId: editFeedId,
          text: caption,
          authorUserId: authUser?.id,
          authorHandle: authUser?.handle,
        });
        if (result?.quarantined) {
          hideContent(editFeedId);
          Alert.alert(
            'รอตรวจสอบ',
            'โพสต์มีคำที่เสี่ยง — เข้าคิว Pending Review ก่อนขึ้นฟีดหลัก',
          );
        }
      })();
      clearDraft();
      console.info('[POST_FLOW] clear composer draft');
      publishingRef.current = false;
      setPublishing(false);
      console.info('[POST_FLOW] 07 reset uploading state');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeAll();
      console.info('[POST_FLOW] 08 navigation success');
      succeeded = true;
      return;
    }

    const postId = await addPost({
      clientPostId: clientPostIdRef.current,
      caption,
      price: 0,
      channel: 'C2C',
      imageUri: mediaType === 'image' ? coverUri : undefined,
      imageUris: mediaType === 'image' ? mediaUris : undefined,
      videoUri: mediaType === 'video' ? coverUri : undefined,
      musicTitle: musicTitle || undefined,
      intent: 'content',
      editorMedia: mediaItems,
      overlays: draft.overlays,
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
    clientPostIdRef.current = null;
    console.info('[POST_FLOW] clear composer draft');
    publishingRef.current = false;
    setPublishing(false);
    console.info('[POST_FLOW] 07 reset uploading state');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeAll();
    console.info('[POST_FLOW] 08 navigation success');
    succeeded = true;
    } catch (error) {
      const statusCode = (error as { statusCode?: number } | null)?.statusCode;
      console.error('[POST_FLOW_ERROR]', {
        step: (error as { step?: string } | null)?.step ?? 'create-post',
        message: error instanceof Error ? error.message : String(error),
        statusCode,
      });
      Alert.alert(
        'อัปโหลดรูปไม่สำเร็จ',
        `โพสต์นี้ถูกเก็บไว้ในฉบับร่างแล้ว\n${error instanceof Error ? error.message : ''}`.trim(),
        [
          { text: 'เก็บไว้ในร่าง', style: 'cancel' },
          { text: 'ลองใหม่', onPress: () => void publish(false) },
        ],
      );
    } finally {
      if (!succeeded) {
        publishingRef.current = false;
        setPublishing(false);
        console.info('[POST_FLOW] 07 reset uploading state');
      }
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEditing ? 'แก้ไขโพสต์' : 'พรีวิว'}</Text>
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
          {mediaItems.map((mediaItem, index) => {
            const textOverlays = draft.overlays.filter(
              (overlay): overlay is TextOverlayObject =>
                overlay.type === 'text' && overlay.mediaId === mediaItem.id,
            );
            const sticker = draft.overlays.find(
              (overlay): overlay is StickerOverlayObject =>
                overlay.type === 'sticker' && overlay.mediaId === mediaItem.id,
            );
            return (
            <Pressable
              key={mediaItem.id}
              style={styles.coverTile}
              onPress={() => openPreviewActions(index)}
              accessibilityLabel={`แก้ไขสื่อชิ้นที่ ${index + 1}`}
            >
              {mediaItem.type === 'video' ? (
                <ProductVideoThumb
                  uri={mediaItem.uri}
                  autoPlay={index === 0}
                  muted
                  interactive={false}
                  contentFit="contain"
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Image source={{ uri: mediaItem.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              )}
              {textOverlays.length ? <TextOverlayRenderer
                overlays={textOverlays}
                sourceSize={mediaItem.width && mediaItem.height ? {
                  width: mediaItem.width,
                  height: mediaItem.height,
                } : undefined}
                contentFit={mediaItem.type === 'image' ? 'cover' : 'contain'}
              /> : null}
              {sticker ? <LockedStickerOverlay sticker={sticker.sticker} transform={sticker.transform} /> : null}
              {index === 0 ? (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>ปก</Text>
                </View>
              ) : null}
            </Pressable>
          );})}
          {mediaUris.length < 6 ? (
            <Pressable style={styles.addTile} onPress={() => void addFromLibrary()}>
              <Ionicons name="images-outline" size={28} color={colors.text.primary} />
              <Text style={styles.addTileText}>คลังภาพ</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {remainingSlots > 0 ? (
          <>
            <OptionRow
              icon="images-outline"
              title={mediaType === 'video' ? 'เปลี่ยนวิดีโอจากคลัง' : 'เพิ่มจากคลังภาพ'}
              subtitle={
                mediaType === 'video'
                  ? 'เลือกคลิปใหม่จากเครื่อง'
                  : `เพิ่มได้อีก ${remainingSlots} รูป (สูงสุด 6)`
              }
              onPress={() => void addFromLibrary()}
            />
            <View style={styles.divider} />
          </>
        ) : null}

        <GrowingTextInput
          minHeight={TITLE_INPUT_MIN}
          maxHeight={TITLE_INPUT_MAX}
          style={styles.titleInput}
          placeholder="เพิ่มชื่อที่โดนใจ"
          placeholderTextColor={colors.text.muted}
          value={title}
          onChangeText={setTitle}
        />
        <GrowingTextInput
          minHeight={DESC_INPUT_MIN}
          maxHeight={DESC_INPUT_MAX}
          lineHeight={20}
          style={styles.descInput}
          placeholder="การเขียนคำอธิบายแบบยาวสามารถช่วยเพิ่มยอดดูได้โดยเฉลี่ยถึง 3 เท่า"
          placeholderTextColor={colors.text.muted}
          value={description}
          onChangeText={setDescription}
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

        {isEditing ? (
          <>
            <OptionRow
              icon="color-wand-outline"
              title="แต่งรูป / ข้อความ / ฟิลเตอร์"
              subtitle="เปิดหน้าแต่งสื่อแบบ TikTok"
              onPress={() =>
                router.push({
                  pathname: '/create-preview',
                  params: { type: mediaType, edit: '1' },
                })
              }
            />
            <View style={styles.divider} />
          </>
        ) : null}

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
        {!isEditing ? (
          <Pressable style={styles.draftBtn} onPress={() => void publish(true)} disabled={publishing}>
            <Ionicons name="folder-open-outline" size={18} color={colors.text.primary} />
            <Text style={styles.draftText}>ร่าง</Text>
          </Pressable>
        ) : (
          <View style={styles.draftBtn} />
        )}
        <Pressable style={styles.postBtn} onPress={() => void publish(false)} disabled={publishing}>
          <View style={styles.postIcon}>
            <Ionicons name="arrow-up" size={14} color="#fff" />
          </View>
          <Text style={styles.postText}>{publishing ? 'กำลังอัปโหลด…' : isEditing ? 'บันทึก' : 'โพสต์'}</Text>
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
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
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
    gap: 6,
  },
  addTileText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
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
