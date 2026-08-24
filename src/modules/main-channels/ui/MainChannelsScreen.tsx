import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { enabledMainChannels } from '../config/mainChannels';
import type { MainChannel } from '../domain/types';
import { MediaViewer } from '@/modules/feed/ui/MediaViewer';
import { useMainTabBarStore } from '@/shared/state/main-tab-bar-store';

const INITIAL_CHANNEL_ID = 'feed';
const CHANNEL_TAB_WIDTH = 54;
const SEARCH_BUTTON_WIDTH = 54;
const INDICATOR_REVEAL_RATIO = 0.05;
const INDICATOR_HOLD_MS = 1800;
const VERTICAL_HIDE_DELTA = 1;

function channelViewPosition(index: number, count: number) {
  // Keep the next channel readable (especially "คลิป" beside the fixed search button).
  return index < count - 1 ? 0.4 : 0.5;
}

export function MainChannelsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const channels = useMemo(enabledMainChannels, []);
  const initialIndex = Math.max(0, channels.findIndex((channel) => channel.id === INITIAL_CHANNEL_ID));
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const feedHeaderActive = channels[activeIndex]?.id === 'feed';
  const pagerRef = useRef<FlatList<MainChannel>>(null);
  const headerRef = useRef<FlatList<MainChannel>>(null);
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const headerHidden = useRef(false);
  const lastVerticalOffset = useRef(0);
  const indicatorHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartX = useRef(0);
  const draggingHorizontally = useRef(false);
  const indicatorTriggeredForDrag = useRef(false);
  const indicatorRevealed = useRef(false);
  const [indicatorMounted, setIndicatorMounted] = useState(false);
  const setBottomBarHidden = useMainTabBarStore((state) => state.setHidden);

  const clearIndicatorTimer = useCallback(() => {
    if (indicatorHideTimer.current) {
      clearTimeout(indicatorHideTimer.current);
      indicatorHideTimer.current = null;
    }
  }, []);

  const revealIndicator = useCallback(() => {
    clearIndicatorTimer();
    // A new swipe may begin while the previous fade-out is still running.
    // Stop that stale animation before restoring the indicator, otherwise its
    // completion callback can unmount the freshly revealed channel bar.
    indicatorOpacity.stopAnimation();
    indicatorRevealed.current = true;
    setIndicatorMounted(true);
    Animated.timing(indicatorOpacity, {
      toValue: 1,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [clearIndicatorTimer, indicatorOpacity]);

  const hideIndicatorAfterDelay = useCallback(() => {
    if (!indicatorRevealed.current) return;
    clearIndicatorTimer();
    indicatorHideTimer.current = setTimeout(() => {
      Animated.timing(indicatorOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        indicatorRevealed.current = false;
        setIndicatorMounted(false);
      });
    }, INDICATOR_HOLD_MS);
  }, [clearIndicatorTimer, indicatorOpacity]);

  useEffect(() => () => clearIndicatorTimer(), [clearIndicatorTimer]);

  const setHeaderHidden = useCallback((hidden: boolean) => {
    if (headerHidden.current === hidden) return;
    headerHidden.current = hidden;
    Animated.timing(headerTranslateY, {
      toValue: hidden ? -(insets.top + 50) : 0,
      duration: hidden ? 120 : 200,
      useNativeDriver: true,
    }).start();
  }, [headerTranslateY, insets.top]);

  const handleVerticalScroll = useCallback((offsetY: number) => {
    const y = Math.max(0, offsetY);
    const delta = y - lastVerticalOffset.current;
    lastVerticalOffset.current = y;
    if (y <= 4) {
      setHeaderHidden(false);
      setBottomBarHidden(false);
      return;
    }
    if (delta > VERTICAL_HIDE_DELTA && y > 2) {
      setHeaderHidden(true);
      setBottomBarHidden(true);
    } else if (delta < -VERTICAL_HIDE_DELTA) {
      setHeaderHidden(false);
      setBottomBarHidden(false);
    }
  }, [setBottomBarHidden, setHeaderHidden]);

  const selectIndex = useCallback((index: number, animated = true) => {
    if (!channels[index]) return;
    pagerRef.current?.scrollToIndex({ index, animated });
    headerRef.current?.scrollToIndex({ index, animated: true, viewPosition: channelViewPosition(index, channels.length) });
    setActiveIndex(index);
  }, [channels]);

  const settle = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(channels.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
    const changed = next !== activeIndex;
    setActiveIndex(next);
    headerRef.current?.scrollToIndex({ index: next, animated: true, viewPosition: channelViewPosition(next, channels.length) });
    if (changed) void Haptics.selectionAsync();
    lastVerticalOffset.current = 0;
    setHeaderHidden(false);
    setBottomBarHidden(false);
    draggingHorizontally.current = false;
    hideIndicatorAfterDelay();
  }, [activeIndex, channels.length, hideIndicatorAfterDelay, setBottomBarHidden, setHeaderHidden, width]);

  const trackHorizontalSwipe = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!draggingHorizontally.current || indicatorTriggeredForDrag.current) return;
    const distance = Math.abs(event.nativeEvent.contentOffset.x - dragStartX.current);
    if (distance >= width * INDICATOR_REVEAL_RATIO) {
      indicatorTriggeredForDrag.current = true;
      // The feed header may currently be translated above the viewport after
      // vertical scrolling. Bring its container back before fading tabs in.
      setHeaderHidden(false);
      setBottomBarHidden(false);
      revealIndicator();
    }
  }, [revealIndicator, setBottomBarHidden, setHeaderHidden, width]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const index = viewableItems.find((token) => token.isViewable)?.index;
    if (index != null) setActiveIndex(index);
  }).current;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: feedHeaderActive ? '#070A08' : 'transparent',
            transform: [{ translateY: feedHeaderActive ? headerTranslateY : 0 }],
          },
        ]}
      >
        <View style={styles.headerRow}>
          {feedHeaderActive ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.brand, { opacity: Animated.subtract(1, indicatorOpacity) }]}
            >
              <Image
                source={require('../../../../assets/brand/boommall-header-logo.png')}
                style={styles.brandImage}
                resizeMode="contain"
              />
            </Animated.View>
          ) : null}
          <Animated.View
            pointerEvents={indicatorMounted ? 'auto' : 'none'}
            style={[styles.channelList, { opacity: indicatorOpacity }]}
          >
            <FlatList
              ref={headerRef}
              horizontal
              data={channels}
              keyExtractor={(channel) => channel.id}
              showsHorizontalScrollIndicator={false}
              onLayout={() => requestAnimationFrame(() => headerRef.current?.scrollToIndex({
                index: activeIndex,
                animated: false,
                viewPosition: channelViewPosition(activeIndex, channels.length),
              }))}
              contentContainerStyle={styles.channelContent}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({ length: CHANNEL_TAB_WIDTH, offset: CHANNEL_TAB_WIDTH * index, index })}
              onScrollToIndexFailed={({ index }) => requestAnimationFrame(() => headerRef.current?.scrollToOffset({
                offset: Math.max(0, index * CHANNEL_TAB_WIDTH - (width - SEARCH_BUTTON_WIDTH) / 2),
                animated: true,
              }))}
              renderItem={({ item, index }) => {
                const selected = index === activeIndex;
                return (
                  <Pressable
                    style={styles.tab}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      selectIndex(index);
                      hideIndicatorAfterDelay();
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text numberOfLines={1} style={[styles.tabText, selected && styles.tabTextActive]}>{item.title}</Text>
                    {selected ? <View style={styles.indicator} /> : null}
                  </Pressable>
                );
              }}
            />
          </Animated.View>
          <Pressable
            style={styles.searchButton}
            hitSlop={8}
            onPress={() => router.push('/search')}
            accessibilityRole="button"
            accessibilityLabel="ค้นหา"
          >
            <Ionicons name="search" size={27} color="#FFFFFF" style={styles.searchIcon} />
          </Pressable>
        </View>
      </Animated.View>

      <FlatList
        ref={pagerRef}
        data={channels}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        keyExtractor={(channel) => channel.id}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScrollBeginDrag={(event) => {
          clearIndicatorTimer();
          dragStartX.current = event.nativeEvent.contentOffset.x;
          draggingHorizontally.current = true;
          indicatorTriggeredForDrag.current = false;
        }}
        onScroll={trackHorizontalSwipe}
        scrollEventThrottle={16}
        onScrollEndDrag={hideIndicatorAfterDelay}
        onMomentumScrollBegin={clearIndicatorTimer}
        onMomentumScrollEnd={settle}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        onScrollToIndexFailed={({ index }) => requestAnimationFrame(() => pagerRef.current?.scrollToOffset({ offset: index * width, animated: false }))}
        renderItem={({ item, index }) => {
          const Channel = item.component;
          return (
            <View style={{ width, flex: 1 }}>
              <Channel active={index === activeIndex} onVerticalScroll={handleVerticalScroll} />
            </View>
          );
        }}
      />
      <MediaViewer />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070A08' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 30,
    backgroundColor: 'transparent',
  },
  headerRow: { height: 50, flexDirection: 'row', alignItems: 'stretch' },
  channelList: { flex: 1 },
  brand: {
    position: 'absolute',
    left: 16,
    top: 8,
    zIndex: 2,
    width: 154,
    height: 35,
  },
  brandImage: { width: '100%', height: '100%' },
  channelContent: { paddingLeft: 10, paddingRight: 0 },
  tab: { width: CHANNEL_TAB_WIDTH, height: 50, alignItems: 'center', justifyContent: 'center' },
  tabText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 14,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tabTextActive: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  indicator: { position: 'absolute', bottom: 3, width: 24, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  searchButton: {
    width: SEARCH_BUTTON_WIDTH,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 8,
  },
  searchIcon: {
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
