import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ProductMediaItem } from '@/modules/commerce/domain/types';
import {
  isVideoMedia,
  MAX_PRODUCT_MEDIA,
  MAX_VIDEO_MB,
} from '@/modules/commerce/domain/product-media';

import { displayMediaUri } from '@/modules/commerce/data/product-media';
import { ProductVideoThumb } from '@/modules/store/ui/sell/ProductVideoThumb';
import { generateVideoThumbnail } from '@/shared/media/videoThumbnails';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

const TILE = 88;
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

type Props = {
  items: ProductMediaItem[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  onReplace?: (index: number) => void;
  /**
   * Patch an item in place — used to write back a runtime-generated video
   * thumbnail so the tile (and the saved listing) keeps the poster after reload.
   */
  onUpdateItem?: (index: number, patch: Partial<ProductMediaItem>) => void;
  editable?: boolean;
  title?: string;
  hint?: string;
  maxItems?: number;
  addLabel?: string;
  showCoverBadge?: boolean;
};

function MediaTileImage({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={styles.broken}>
        <Ionicons name="image-outline" size={22} color={colors.text.muted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.media}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Video tile that prefers an existing poster (thumbnailUri, falling back to the
 * video uri itself). When no poster exists yet, generates one on the fly from
 * the local file:// and shows a loading indicator instead of a gray void until
 * it's ready.
 */
function VideoTile({
  uri,
  item,
  index,
  onThumbnailGenerated,
}: {
  uri: string;
  item: ProductMediaItem;
  index: number;
  onThumbnailGenerated?: (index: number, thumbUri: string) => void;
}) {
  const [thumbUri, setThumbUri] = useState<string | null>(() => item.thumbnailUri ?? null);
  const [loading, setLoading] = useState(!item.thumbnailUri);
  const attemptedRef = useRef(Boolean(item.thumbnailUri));
  // Keep the callback in a ref so parent re-renders (which recreate inline
  // arrows) never cancel the in-flight thumbnail generation via effect cleanup.
  const onThumbRef = useRef(onThumbnailGenerated);
  onThumbRef.current = onThumbnailGenerated;

  useEffect(() => {
    if (item.thumbnailUri) {
      setThumbUri(item.thumbnailUri);
      setLoading(false);
      return;
    }
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    let cancelled = false;
    setLoading(true);
    generateVideoThumbnail(uri)
      .then((t) => {
        if (cancelled) return;
        if (t) {
          setThumbUri(t);
          onThumbRef.current?.(index, t);
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error('[ProductMediaStrip] runtime video thumbnail failed', e);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.thumbnailUri, uri, index]);

  if (loading) {
    return (
      <View style={styles.mediaLoading}>
        <ActivityIndicator color={colors.brand.primaryDark} size="small" />
      </View>
    );
  }

  return <MediaTileImage uri={displayMediaUri(thumbUri ?? uri)} />;
}

function MediaPreviewModal({
  items,
  index,
  onClose,
}: {
  items: ProductMediaItem[];
  index: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const item = items[index];
  if (!item) return null;
  const uri = displayMediaUri(item.uri);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} showDim rootInModal style={styles.previewRoot}>
        <View style={[styles.previewTop, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.previewClose} onPress={onClose} hitSlop={8} accessibilityLabel="ปิด">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.previewCounter}>
            {index + 1}/{items.length}
          </Text>
          <View style={{ width: 36 }} />
        </View>
        {isVideoMedia(item) ? (
          <ProductVideoThumb
            uri={uri}
            style={styles.previewMedia}
            nativeControls
            muted={false}
            autoPlay
            contentFit="contain"
          />
        ) : (
          <Image source={{ uri }} style={styles.previewMedia} resizeMode="contain" />
        )}
      </DragDownDismiss>

    </Modal>
  );
}

export function ProductMediaStrip({
  items,
  onAdd,
  onRemove,
  onMove,
  onReplace,
  onUpdateItem,
  editable = true,
  title,
  hint,
  maxItems = MAX_PRODUCT_MEDIA,
  addLabel = 'รูป/วิดีโอ',
  showCoverBadge = true,
}: Props) {
  const remaining = Math.max(0, maxItems - items.length);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  return (
    <View>
      <Text style={styles.label}>
        {title ?? `สื่อหลัก (${items.length}/${maxItems}) · รูปหรือวิดีโอ · ไฟล์แรก = ปก`}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {items.map((item, index) => {
          const uri = displayMediaUri(item.uri);
          const isVideo = isVideoMedia(item);
          return (
            <View key={`${item.uri}-${index}`} style={styles.slot}>
              <View style={styles.tile}>
                <Pressable
                  onPress={() => setPreviewIndex(index)}
                  accessibilityLabel={isVideo ? 'ดูวิดีโอ' : 'ดูรูป'}
                >
                  {isVideo ? (
                    <>
                      {/* Fast poster — renders instantly without mounting a player */}
                      <VideoTile
                        uri={uri}
                        item={item}
                        index={index}
                        onThumbnailGenerated={(i, t) => onUpdateItem?.(i, { thumbnailUri: t })}
                      />
                      <View style={styles.playBadge} pointerEvents="none">
                        <Ionicons name="play" size={18} color="#fff" />
                      </View>
                    </>
                  ) : (
                    <MediaTileImage uri={uri} />
                  )}
                </Pressable>
                <View style={styles.badge} pointerEvents="none">
                  <Text style={styles.badgeText}>
                    {showCoverBadge && index === 0
                      ? 'ปก'
                      : isVideo
                        ? 'วิดีโอ'
                        : `${index + 1}`}
                  </Text>
                </View>

                {editable ? (
                  <Pressable
                    style={styles.remove}
                    onPress={() => {
                      Alert.alert('ลบรูปนี้?', 'รูปจะถูกนำออกจากรายการ', [
                        { text: 'ยกเลิก', style: 'cancel' },
                        { text: 'ลบ', style: 'destructive', onPress: () => onRemove(index) },
                      ]);
                    }}
                    hitSlop={8}
                    accessibilityLabel="ลบรูป"
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                ) : null}
              </View>
              {editable && onReplace ? (
                <Pressable
                  style={styles.changeBtn}
                  onPress={() => onReplace(index)}
                  accessibilityLabel="เปลี่ยนรูป"
                >
                  <Text style={styles.changeText}>เปลี่ยน</Text>
                </Pressable>
              ) : null}
              {onMove && items.length > 1 ? (
                <View style={styles.moveRow}>
                  <Pressable
                    onPress={() => onMove(index, -1)}
                    disabled={index === 0 || !editable}
                    hitSlop={8}
                    accessibilityLabel="เลื่อนซ้าย"
                  >
                    <Ionicons
                      name="chevron-back"
                      size={14}
                      color={index === 0 ? colors.border.soft : colors.text.secondary}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => onMove(index, 1)}
                    disabled={index === items.length - 1 || !editable}
                    hitSlop={8}
                    accessibilityLabel="เลื่อนขวา"
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={index === items.length - 1 ? colors.border.soft : colors.text.secondary}
                    />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
        {editable && remaining > 0 ? (
          <Pressable style={styles.addTile} onPress={onAdd}>
            <Ionicons name="images-outline" size={20} color={colors.text.secondary} />
            <Text style={styles.addText}>{addLabel}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {hint !== '' ? (
        <Text style={styles.hint}>
          {hint ??
            `แตะรูปเพื่อดู · กดเปลี่ยนเพื่อเลือกไฟล์ใหม่ · ปกได้ทั้งรูปและวิดีโอ (.mp4 / .mov ไม่เกิน ${MAX_VIDEO_MB} MB)`}
        </Text>
      ) : null}

      {previewIndex != null ? (
        <MediaPreviewModal
          items={items}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  strip: { gap: 10, paddingVertical: 2, alignItems: 'flex-start' },
  slot: { width: TILE, alignItems: 'center' },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E8EBE9',
  },
  media: { width: TILE, height: TILE, backgroundColor: '#E8EBE9' },
  mediaLoading: {
    width: TILE,
    height: TILE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EBE9',
  },
  broken: {
    width: TILE,
    height: TILE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EBE9',
  },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  playBadge: {
    position: 'absolute',
    top: TILE / 2 - 13,
    left: TILE / 2 - 13,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
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
  changeBtn: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.brand.mist,
  },
  changeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brand.primaryDark,
  },
  moveRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: TILE,
    paddingHorizontal: 4,
  },
  addTile: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(10,22,17,0.22)',
    backgroundColor: '#F2F4F3',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: { color: colors.text.secondary, fontSize: 11, fontWeight: '800' },
  hint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
  },
  previewRoot: { flex: 1, backgroundColor: '#000' },
  previewTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  previewClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCounter: { color: '#fff', fontSize: 14, fontWeight: '800' },
  previewMedia: { width: SCREEN_W, height: SCREEN_H },
});
