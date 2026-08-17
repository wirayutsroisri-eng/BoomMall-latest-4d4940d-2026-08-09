import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import type { GallerySlide } from '@/modules/shop/domain/product-display';
import { displayMediaUri } from '@/modules/commerce/data/product-media';
import { ProductVideoThumb } from '@/modules/store/ui/sell/ProductVideoThumb';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

type Props = {
  visible: boolean;
  slides: GallerySlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

function ZoomableImage({
  uri,
  onZoomChange,
}: {
  uri: string;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);

  const reset = useCallback(() => {
    scale.value = 1;
    tx.value = 0;
    ty.value = 0;
    onZoomChange(false);
  }, [onZoomChange, scale, tx, ty]);

  useEffect(() => {
    reset();
  }, [uri, reset]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(4, Math.max(1, startScale.value * e.scale));
      runOnJS(onZoomChange)(scale.value > 1.05);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1, { damping: 18, stiffness: 220 });
        tx.value = withSpring(0, { damping: 18, stiffness: 220 });
        ty.value = withSpring(0, { damping: 18, stiffness: 220 });
        runOnJS(onZoomChange)(false);
      }
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (scale.value > 1.08) state.activate();
      else state.fail();
    })
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = startTx.value + e.translationX;
      ty.value = startTy.value + e.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.2) {
        scale.value = withSpring(1, { damping: 18, stiffness: 220 });
        tx.value = withSpring(0, { damping: 18, stiffness: 220 });
        ty.value = withSpring(0, { damping: 18, stiffness: 220 });
        runOnJS(onZoomChange)(false);
      } else {
        scale.value = withSpring(2.4, { damping: 16, stiffness: 200 });
        runOnJS(onZoomChange)(true);
      }
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.zoomFrame, style]}>
        <Image source={{ uri: displayMediaUri(uri) }} style={styles.zoomImage} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

export function ZoomGalleryModal({ visible, slides, index, onIndexChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [zoomed, setZoomed] = useState(false);
  const listRef = React.useRef<FlatList<GallerySlide>>(null);

  useEffect(() => {
    if (!visible) {
      setZoomed(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [visible, index]);

  const onMomentum = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      if (next !== index) onIndexChange(next);
      setZoomed(false);
    },
    [index, onIndexChange],
  );

  if (!slides.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} showDim rootInModal enabled={!zoomed} style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} accessibilityLabel="ปิด">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.counter}>
            {Math.min(index, slides.length - 1) + 1}/{slides.length}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <FlatList
          ref={listRef}
          data={slides}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          keyExtractor={(item) => item.key}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          onMomentumScrollEnd={onMomentum}
          onScrollToIndexFailed={({ index: failed }) => {
            listRef.current?.scrollToOffset({ offset: failed * SCREEN_W, animated: false });
          }}
          extraData={index}
          renderItem={({ item, index: pageIndex }) => (
            <View style={styles.page}>
              {item.type === 'video' ? (
                <ProductVideoThumb
                  uri={displayMediaUri(item.uri)}
                  style={styles.zoomImage}
                  nativeControls
                  muted={false}
                  autoPlay={pageIndex === index}
                  contentFit="contain"
                />
              ) : (
                <ZoomableImage uri={item.uri} onZoomChange={setZoomed} />
              )}
            </View>
          )}
        />
      </DragDownDismiss>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { color: '#fff', fontSize: 14, fontWeight: '800' },
  page: { width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center' },
  zoomFrame: { width: SCREEN_W, height: SCREEN_H, alignItems: 'center', justifyContent: 'center' },
  zoomImage: { width: SCREEN_W, height: SCREEN_H },
});
