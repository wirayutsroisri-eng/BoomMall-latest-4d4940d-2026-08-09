import React, { memo, useMemo, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EditorMedia, OverlayObject, StickerOverlayObject, TextOverlayObject } from '@/modules/create/domain/editorComposition';
import { LockedStickerOverlay } from '@/modules/create/ui/LockedStickerOverlay';
import { TextOverlayRenderer } from '@/modules/create/ui/TextOverlayRenderer';

type Props = {
  uris: string[];
  width: number;
  height: number;
  onPress: (index: number, frame?: { x: number; y: number; width: number; height: number }) => void;
  mediaIds?: string[];
  overlays?: OverlayObject[];
  media?: EditorMedia[];
  /** Feed-only adaptive option. Existing full-screen callers keep side-by-side by default. */
  twoImageLayout?: 'side-by-side' | 'stacked';
};

type Tile = { index: number; style: object };

const GAP = 2;

/** Facebook-style overview: at most four mounted images regardless of album size. */
export const MultiImageGrid = memo(function MultiImageGrid({ uris, width, height, onPress, mediaIds, overlays = [], media, twoImageLayout = 'side-by-side' }: Props) {
  const tileRefs = useRef<(View | null)[]>([]);
  const tiles = useMemo<Tile[]>(() => {
    const halfW = (width - GAP) / 2;
    const halfH = (height - GAP) / 2;
    if (uris.length === 2) {
      if (twoImageLayout === 'stacked') {
        return [
          { index: 0, style: { left: 0, top: 0, width, height: halfH } },
          { index: 1, style: { left: 0, top: halfH + GAP, width, height: halfH } },
        ];
      }
      return [
        { index: 0, style: { left: 0, top: 0, width: halfW, height } },
        { index: 1, style: { left: halfW + GAP, top: 0, width: halfW, height } },
      ];
    }
    if (uris.length === 3) {
      return [
        { index: 0, style: { left: 0, top: 0, width: halfW, height } },
        { index: 1, style: { left: halfW + GAP, top: 0, width: halfW, height: halfH } },
        { index: 2, style: { left: halfW + GAP, top: halfH + GAP, width: halfW, height: halfH } },
      ];
    }
    return uris.slice(0, 4).map((_, index) => ({
      index,
      style: {
        left: (index % 2) * (halfW + GAP),
        top: Math.floor(index / 2) * (halfH + GAP),
        width: halfW,
        height: halfH,
      },
    }));
  }, [height, twoImageLayout, uris, width]);

  const remaining = Math.max(0, uris.length - 4);

  return (
    <View style={[styles.root, { width, height }]}>
      {tiles.map(({ index, style }) => {
        const mediaId = mediaIds?.[index];
        const textOverlays = overlays.filter(
          (overlay): overlay is TextOverlayObject =>
            overlay.type === 'text' && overlay.mediaId === mediaId,
        );
        const sticker = overlays.find(
          (overlay): overlay is StickerOverlayObject =>
            overlay.type === 'sticker' && overlay.mediaId === mediaId,
        );
        return (
        <Pressable
          key={`${uris[index]}:${index}`}
          ref={(r) => { tileRefs.current[index] = r; }}
          style={[styles.tile, style]}
          onPress={() => {
            const ref = tileRefs.current[index];
            if (!ref) return onPress(index);
            ref.measureInWindow((x, y, w, h) => {
              if (!w || !h) return onPress(index);
              onPress(index, { x, y, width: w, height: h });
            });
          }}
          accessibilityRole="imagebutton"
          accessibilityLabel={`เปิดรูป ${index + 1} จาก ${uris.length}`}
        >
          <Image source={{ uri: uris[index] }} style={styles.image} resizeMode="cover" />
          {textOverlays.length ? <TextOverlayRenderer
            overlays={textOverlays}
            sourceSize={media?.[index]?.width && media[index]?.height ? {
              width: media[index]!.width!,
              height: media[index]!.height!,
            } : undefined}
            contentFit="cover"
          /> : null}
          {sticker ? <LockedStickerOverlay sticker={sticker.sticker} transform={sticker.transform} /> : null}
          {remaining > 0 && index === 3 ? (
            <View style={styles.more} pointerEvents="none">
              <Text style={styles.moreText}>+{remaining}</Text>
            </View>
          ) : null}
        </Pressable>
      );})}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'relative', overflow: 'hidden', backgroundColor: '#080808' },
  tile: { position: 'absolute', overflow: 'hidden', backgroundColor: '#151515' },
  image: { width: '100%', height: '100%' },
  more: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  moreText: { color: '#fff', fontSize: 34, fontWeight: '800' },
});
