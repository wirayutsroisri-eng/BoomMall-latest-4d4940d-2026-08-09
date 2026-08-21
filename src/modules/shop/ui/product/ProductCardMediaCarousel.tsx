import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ProductMediaItem } from '@/modules/commerce/domain/types';
import { thumbnailUriOf } from '@/modules/commerce/domain/product-media';
import { displayMediaUri } from '@/modules/commerce/data/product-media';
import { ProductVideoThumb } from '@/modules/store/ui/sell/ProductVideoThumb';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

type Props = {
  /** All product media — each slot may be an image or a video, order is preserved. */
  media: ProductMediaItem[];
  /** Optional separate video URI that will be placed at index 0 */
  videoUri?: string;
  /** Card width (square aspect) */
  size: number;
  /** Called when user taps the card to expand */
  onPress?: () => void;
  /** Aspect ratio for the card: 'square' | '4:5' */
  aspect?: 'square' | '4:5';
};

/**
 * Product Card Media Carousel for Shop Grid / Marketplace columns.
 *
 * - Any slot may be an image or a video (order is preserved from the product).
 * - Videos autoplay muted loop cover; images show the first-frame poster via thumbnailUri.
 * - Horizontal swipe with dots indicator.
 * - Tap to open full-screen preview modal (videos play with controls).
 */
export function ProductCardMediaCarousel({
  media,
  videoUri,
  size,
  onPress,
  aspect = 'square',
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Preserve seller's slot order — every index may be an image or a video.
  const items = React.useMemo<ProductMediaItem[]>(() => {
    const result: ProductMediaItem[] = [];
    if (videoUri) {
      result.push({ uri: videoUri, type: 'video' });
    }
    for (const m of media) {
      if (videoUri && m.type === 'video' && m.uri === videoUri) continue;
      result.push(m);
    }
    return result;
  }, [media, videoUri]);

  const cardHeight = aspect === '4:5' ? size * 1.25 : size;
  const hasMultiple = items.length > 1;

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!hasMultiple) return;
      const offset = e.nativeEvent.contentOffset.x;
      const idx = Math.round(offset / size);
      if (idx !== activeIndex && idx >= 0 && idx < items.length) {
        setActiveIndex(idx);
      }
    },
    [activeIndex, hasMultiple, items.length, size],
  );

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      setPreviewOpen(true);
    }
  };

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { width: size, height: cardHeight }]}>
        <Ionicons name="image-outline" size={28} color={colors.text.muted} />
      </View>
    );
  }

  return (
    <View style={{ width: size, height: cardHeight }}>
      <Pressable onPress={handlePress} style={styles.cardPress}>
        {items.length === 1 ? (
          // Single item — no scroll needed
          <MediaItem item={items[0]} width={size} height={cardHeight} autoPlayVideo isActive />
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={100}
            style={{ width: size, height: cardHeight }}
          >
            {items.map((item, idx) => (
              <View key={`${item.uri}-${idx}`} style={{ width: size, height: cardHeight }}>
                <MediaItem
                  item={item}
                  width={size}
                  height={cardHeight}
                  autoPlayVideo
                  isActive={idx === activeIndex}
                />
              </View>
            ))}
          </ScrollView>
        )}

        {/* Video badge */}
        {items[activeIndex]?.type === 'video' && (
          <View style={styles.videoBadge} pointerEvents="none">
            <Ionicons name="videocam" size={12} color="#fff" />
          </View>
        )}

        {/* Image count badge */}
        {hasMultiple && (
          <View style={styles.countBadge} pointerEvents="none">
            <Text style={styles.countText}>
              {activeIndex + 1}/{items.length}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Dots indicator */}
      {hasMultiple && (
        <View style={styles.dotsRow}>
          {items.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                {
                  backgroundColor: idx === activeIndex ? colors.brand.primary : 'rgba(0,0,0,0.18)',
                  width: idx === activeIndex ? 14 : 5,
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Full-screen preview modal */}
      {previewOpen && (
        <MediaPreviewModal
          items={items}
          initialIndex={activeIndex}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </View>
  );
}

/* ─── Single media item renderer ─── */

function MediaItem({
  item,
  width,
  height,
  autoPlayVideo,
  isActive,
}: {
  item: ProductMediaItem;
  width: number;
  height: number;
  autoPlayVideo: boolean;
  isActive: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (item.type === 'video') {
    // Inactive slides render the fast first-frame poster instead of a live player —
    // the active (visible) slide is the only one that plays, saving GPU/CPU.
    if (!isActive) {
      return (
        <View style={{ width, height }}>
          <Image
            source={{ uri: displayMediaUri(thumbnailUriOf(item) ?? item.uri) }}
            style={{ width, height }}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
          <View style={styles.imgFallback} pointerEvents="none">
            <Ionicons name="play-circle" size={26} color="#fff" />
          </View>
        </View>
      );
    }
    return (
      <ProductVideoThumb
        uri={item.uri}
        poster={item.thumbnailUri ? displayMediaUri(item.thumbnailUri) : undefined}
        style={{ width, height }}
        autoPlay={autoPlayVideo}
        muted
        contentFit="cover"
        interactive={false}
      />
    );
  }

  if (imgFailed) {
    return (
      <View style={[styles.imgFallback, { width, height }]}>
        <Ionicons name="image-outline" size={24} color={colors.text.muted} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: item.uri }}
      style={{ width, height }}
      resizeMode="cover"
      onError={() => setImgFailed(true)}
    />
  );
}

/* ─── Full-screen preview modal ─── */

function MediaPreviewModal({
  items,
  initialIndex,
  onClose,
}: {
  items: ProductMediaItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.x;
      const idx = Math.round(offset / SCREEN_W);
      if (idx !== currentIdx && idx >= 0 && idx < items.length) {
        setCurrentIdx(idx);
      }
    },
    [currentIdx, items.length],
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} showDim rootInModal style={styles.previewRoot}>
        <View style={[styles.previewTop, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.previewClose} onPress={onClose} hitSlop={8} accessibilityLabel="ปิด">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.previewCounter}>
            {currentIdx + 1}/{items.length}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={100}
          contentOffset={{ x: initialIndex * SCREEN_W, y: 0 }}
          style={styles.previewScroll}
        >
          {items.map((item, idx) => (
            <View key={`preview-${item.uri}-${idx}`} style={styles.previewPage}>
              {item.type === 'video' ? (
                <ProductVideoThumb
                  uri={item.uri}
                  poster={item.thumbnailUri ? displayMediaUri(item.thumbnailUri) : undefined}
                  style={styles.previewMedia}
                  nativeControls
                  muted={false}
                  autoPlay
                  contentFit="contain"
                />
              ) : (
                <Image source={{ uri: item.uri }} style={styles.previewMedia} resizeMode="contain" />
              )}
            </View>
          ))}
        </ScrollView>

        {/* Preview dots */}
        {items.length > 1 && (
          <View style={styles.previewDotsRow}>
            {items.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.previewDot,
                  {
                    backgroundColor: idx === currentIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                  },
                ]}
              />
            ))}
          </View>
        )}
      </DragDownDismiss>
    </Modal>
  );
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  cardPress: { flex: 1, overflow: 'hidden' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
  imgFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F0F0',
  },
  videoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  dotsRow: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },

  /* Preview modal */
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
  previewScroll: { flex: 1 },
  previewPage: { width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center' },
  previewMedia: { width: SCREEN_W, height: SCREEN_H * 0.75 },
  previewDotsRow: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
