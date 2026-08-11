import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { FeedItem } from '@/modules/feed/domain/types';
import { colors } from '@/shared/theme/colors';

const COLUMNS = 3;
/** Tight gutters — Instagram / showroom density from reference */
const GRID_GAP = 1.5;
/**
 * BoomMall profile thumbnail cell = 3:4 (e.g. 900×1200 / 1080×1440).
 * Source video/poster stays 9:16 (e.g. 1080×1920); Image uses resizeMode="cover"
 * to center-crop into the 3:4 window.
 */
const THUMB_ASPECT = 3 / 4;

function formatViews(n: number) {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1000) {
    const v = n / 1000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return n.toLocaleString('en-US');
}

export type ContentGridMode = 'content' | 'showroom';

type Props = {
  items: FeedItem[];
  /** `content` = clips/posts · `showroom` = full product tiles with name + price */
  mode?: ContentGridMode;
  /** ปักหมุดคลิปแถวบน (โหมด content) — ค่าเริ่มต้น 0 */
  pinnedCount?: number;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  emptyText: string;
  onPressItem?: (item: FeedItem) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Edge-to-edge 3-col showroom / content grid.
 * Thumbnail window is 3:4; 9:16 source media is cover-cropped (not stretched).
 */
export function ContentGrid({
  items,
  mode = 'content',
  pinnedCount = 0,
  emptyIcon = 'videocam-outline',
  emptyText,
  onPressItem,
  style,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const cellWidth = Math.max(
    1,
    (windowWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS,
  );
  const cellHeight = cellWidth / THUMB_ASPECT;

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name={emptyIcon} size={40} color={colors.text.muted} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.grid, style]}>
      {items.map((item, index) => {
        const isVideo = Boolean(item.videoUri);
        const isPinned = mode === 'content' && index < pinnedCount;
        const caption =
          mode === 'showroom'
            ? item.product.name
            : item.caption?.trim() || item.product.name;
        const body = (
          <>
            {item.imageUri ? (
              <Image
                source={{ uri: item.imageUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient colors={item.gradient} style={StyleSheet.absoluteFill} />
            )}

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.72)']}
              style={styles.fade}
              pointerEvents="none"
            />

            {item.isLive ? (
              <View style={styles.liveBadge}>
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : isPinned ? (
              <View style={styles.pinnedBadge}>
                <Text style={styles.pinnedText}>ปักหมุดแล้ว</Text>
              </View>
            ) : mode === 'showroom' ? (
              <View style={styles.tierBadge}>
                <Text style={styles.tierText}>{item.product.tier}</Text>
              </View>
            ) : null}

            {mode === 'content' ? (
              <View style={styles.viewsCorner} pointerEvents="none">
                <Ionicons name="play" size={11} color="#fff" />
                <Text style={styles.views}>{formatViews(item.likes)}</Text>
              </View>
            ) : (
              <View style={styles.bottomMeta}>
                <View style={styles.pricePill}>
                  <Text style={styles.pricePillText}>
                    ฿{item.product.basePrice.toLocaleString('th-TH')}
                  </Text>
                </View>
                <Text style={styles.caption} numberOfLines={2}>
                  {caption}
                </Text>
                <Text style={styles.shopLine} numberOfLines={1}>
                  {item.product.shopName}
                </Text>
              </View>
            )}

            {mode === 'content' ? (
              <View style={styles.captionCorner} pointerEvents="none">
                <Text style={styles.caption} numberOfLines={2}>
                  {caption}
                </Text>
              </View>
            ) : null}

            {isVideo && mode === 'showroom' ? (
              <View style={styles.playCenter} pointerEvents="none">
                <View style={styles.playCircle}>
                  <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 2 }} />
                </View>
              </View>
            ) : null}
          </>
        );

        const cellStyle = [styles.cell, { width: cellWidth, height: cellHeight }];

        if (onPressItem) {
          return (
            <Pressable
              key={item.id}
              style={cellStyle}
              onPress={() => onPressItem(item)}
              accessibilityLabel={
                mode === 'showroom'
                  ? `${item.product.name} ฿${item.product.basePrice}`
                  : `โพสต์ ${caption}`
              }
            >
              {body}
            </Pressable>
          );
        }

        return (
          <View key={item.id} style={cellStyle}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    width: '100%',
  },
  cell: {
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: colors.brand.ink,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  liveBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.accent.live,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  tierBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tierText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  pinnedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.accent.live,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pinnedText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  viewsCorner: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  captionCorner: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 24,
  },
  playCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  bottomMeta: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    gap: 3,
  },
  pricePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,168,107,0.92)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  pricePillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  caption: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  views: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  shopLine: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 9,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 10,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
