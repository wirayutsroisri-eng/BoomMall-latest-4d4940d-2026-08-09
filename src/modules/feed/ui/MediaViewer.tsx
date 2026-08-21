import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, Modal, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedMediaViewerStore } from '../state/feed-media-viewer-store';
import { MediaViewerGestureLayer } from './MediaViewerGestureLayer';
import { type StickerOverlayObject, type TextOverlayObject } from '@/modules/create/domain/editorComposition';
import { TextOverlayRenderer } from '@/modules/create/ui/TextOverlayRenderer';
import { LockedStickerOverlay } from '@/modules/create/ui/LockedStickerOverlay';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const MediaViewer = memo(function MediaViewer() {
  const visible = useFeedMediaViewerStore((state) => state.visible);
  const uris = useFeedMediaViewerStore((state) => state.uris);
  const initialIndex = useFeedMediaViewerStore((state) => state.initialIndex);
  const mediaIds = useFeedMediaViewerStore((state) => state.mediaIds);
  const overlays = useFeedMediaViewerStore((state) => state.overlays);
  const media = useFeedMediaViewerStore((state) => state.media);
  const close = useFeedMediaViewerStore((state) => state.close);
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<string>>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const dismissY = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex);
    setZoomed(false);
    dismissY.value = 0;
    requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: initialIndex, animated: false }));
  }, [dismissY, initialIndex, visible]);

  useEffect(() => {
    if (!visible) return;
    const targets = [uris[index - 1], uris[index + 1]].filter((uri): uri is string => Boolean(uri));
    for (const uri of targets) void Image.prefetch(uri);
  }, [index, uris, visible]);

  const onScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.max(0, Math.min(uris.length - 1, Math.round(event.nativeEvent.contentOffset.x / SCREEN_W))));
  }, [uris.length]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dismissY.value, [0, SCREEN_H * 0.55], [1, 0], 'clamp'),
  }));
  const pagerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dismissY.value },
      { scale: interpolate(dismissY.value, [0, SCREEN_H * 0.6], [1, 0.76], 'clamp') },
    ],
  }));

  // Unmount immediately after the completed drag animation calls close().
  // Keeping hidden Modal children mounted lets resetKey effects restore transforms
  // for one visible native frame, which looks like the image jumps upward.
  if (!visible || !uris.length) return null;

  const compactIndicator = uris.length > 7;

  return (
    <Modal visible={visible} transparent presentationStyle="overFullScreen" animationType="fade" onRequestClose={close}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <Animated.View style={[styles.pager, pagerStyle]}>
          <FlatList
            ref={listRef}
            data={uris}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIndex}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            removeClippedSubviews
            keyExtractor={(uri, itemIndex) => `${uri}:${itemIndex}`}
            getItemLayout={(_, itemIndex) => ({ length: SCREEN_W, offset: SCREEN_W * itemIndex, index: itemIndex })}
            onMomentumScrollEnd={onScrollEnd}
            onScrollToIndexFailed={({ index: failedIndex }) => requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: failedIndex, animated: false }))}
            renderItem={({ item: uri, index: itemIndex }) => {
              const mediaId = mediaIds[itemIndex];
              const textOverlays = overlays.filter(
                (overlay): overlay is TextOverlayObject =>
                  overlay.type === 'text' && overlay.mediaId === mediaId,
              );
              const sticker = overlays.find(
                (overlay): overlay is StickerOverlayObject =>
                  overlay.type === 'sticker' && overlay.mediaId === mediaId,
              );
              return (
              <View style={styles.page}>
                <MediaViewerGestureLayer
                  active={itemIndex === index}
                  resetKey={`${visible}:${itemIndex === index ? index : 'idle'}`}
                  dismissY={dismissY}
                  onDismiss={close}
                  onZoomChange={setZoomed}
                >
                  <Image source={{ uri }} style={styles.image} resizeMode="contain" />
                  {textOverlays.length ? <TextOverlayRenderer
                    overlays={textOverlays}
                    sourceSize={media[itemIndex]?.width && media[itemIndex]?.height ? {
                      width: media[itemIndex]!.width!,
                      height: media[itemIndex]!.height!,
                    } : undefined}
                    contentFit="contain"
                  /> : null}
                  {sticker ? <LockedStickerOverlay sticker={sticker.sticker} transform={sticker.transform} /> : null}
                </MediaViewerGestureLayer>
              </View>
            );}}
          />
        </Animated.View>
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <Pressable style={styles.close} onPress={close} accessibilityLabel="ปิด">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {compactIndicator ? (
            <Text style={styles.counter}>{index + 1}/{uris.length}</Text>
          ) : (
            <View style={styles.dots} accessibilityLabel={`รูป ${index + 1} จาก ${uris.length}`}>
              {uris.map((_, dotIndex) => (
                <View key={dotIndex} style={[styles.dot, dotIndex === index && styles.dotActive]} />
              ))}
            </View>
          )}
          <View style={styles.close} />
        </View>
        <View style={styles.edgeHints} pointerEvents="none">
          <View style={styles.edgeHintSlot}>
            {index > 0 ? <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.72)" /> : null}
          </View>
          <View style={styles.edgeHintSlot}>
            {index < uris.length - 1 ? <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.72)" /> : null}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  pager: { flex: 1 },
  page: { width: SCREEN_W, height: SCREEN_H },
  image: { width: '100%', height: '100%' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  counter: { color: '#fff', fontSize: 15, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.38)' },
  dotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  edgeHints: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  edgeHintSlot: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' },
});
