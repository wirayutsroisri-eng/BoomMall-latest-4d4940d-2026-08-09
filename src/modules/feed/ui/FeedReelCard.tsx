import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/shared/theme/colors';
import type { FeedItem } from '@/modules/feed/domain/types';
import { RightActionBar } from './RightActionBar';

type Props = {
  item: FeedItem;
  height: number;
  isActive?: boolean;
  onLike: () => void;
  onComment: () => void;
  onQuickBuy: () => void;
  onVaultSave: () => void;
  onCall: () => void;
  onShare: () => void;
  onAvatar?: () => void;
  /** Swipe left — parent decides: next tab OR open Visitor Profile on last tab */
  onSwipeLeft?: () => void;
  /** Swipe right — parent decides: previous tab OR hard stop at leftmost boundary */
  onSwipeRight?: () => void;
};

export function FeedReelCard({
  item,
  height,
  isActive,
  onLike,
  onComment,
  onQuickBuy,
  onVaultSave,
  onCall,
  onShare,
  onAvatar,
  onSwipeLeft,
  onSwipeRight,
}: Props) {
  const progress = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      progress.value = 0;
      progress.value = withRepeat(withTiming(1, { duration: 15000, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
    return () => cancelAnimation(progress);
  }, [isActive, progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      heartScale.value = 0.4;
      heartOpacity.value = 1;
      heartScale.value = withSequence(
        withTiming(1.15, { duration: 180, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 100 }),
      );
      heartOpacity.value = withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }),
      );
    })
    .onEnd(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (!item.liked) onLike();
    })
    .runOnJS(true);

  const SWIPE_DISTANCE = 64;
  const SWIPE_VELOCITY = 350;

  const horizontalSwipe = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      const strongEnough =
        Math.abs(e.translationX) > SWIPE_DISTANCE || Math.abs(e.velocityX) > SWIPE_VELOCITY;
      if (!strongEnough) return;

      if (e.translationX < 0) {
        // Swipe left → next tab, or Visitor Profile when already on last tab (สำหรับคุณ)
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onSwipeLeft?.();
      } else {
        // Swipe right → previous tab, hard-stop at leftmost (ใกล้คุณ)
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSwipeRight?.();
      }
    })
    .runOnJS(true);

  const composedGesture = Gesture.Simultaneous(doubleTap, horizontalSwipe);

  return (
    <GestureDetector gesture={composedGesture}>
    <View style={[styles.card, { height }]}>
      {item.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={item.gradient} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={[colors.feed.gradientTop, 'transparent', colors.feed.gradientBottom]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.heartBurst, heartStyle]} pointerEvents="none">
        <Ionicons name="heart" size={110} color="#fff" />
      </Animated.View>

      <View style={styles.meta}>
        {item.isLive ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : null}
        {item.isUserPost ? (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>โพสต์ใหม่ของคุณ</Text>
          </View>
        ) : null}
        <Pressable onPress={onAvatar} hitSlop={6}>
          <Text style={styles.author}>@{item.authorHandle.replace('@', '')}</Text>
        </Pressable>
        <Text style={styles.caption} numberOfLines={3}>
          {item.caption}
        </Text>
        <Text style={styles.location}>📍 {item.location} · {item.product.tier}</Text>
        <Text style={styles.music} numberOfLines={1}>♪ {item.musicTitle}</Text>
      </View>

      <Pressable style={styles.shopTag} onPress={onQuickBuy} hitSlop={4}>
        <View style={styles.shopTagIcon}>
          <Ionicons name="bag-handle" size={13} color={colors.brand.ink} />
        </View>
        <Text style={styles.shopTagLabel} numberOfLines={1}>เริ่มต้น</Text>
        <Text style={styles.shopTagPrice}>
          ฿{item.product.basePrice.toLocaleString('th-TH')}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.text.primary} />
      </Pressable>

      <RightActionBar
        authorInitial={item.author.slice(0, 1)}
        likes={item.likes}
        comments={item.comments}
        shares={item.shares}
        liked={item.liked}
        saved={item.saved}
        onAvatar={onAvatar}
        onLike={onLike}
        onComment={onComment}
        onQuickBuy={onQuickBuy}
        onVaultSave={onVaultSave}
        onShare={onShare}
        onCall={onCall}
      />

      <View style={styles.progressTrack} pointerEvents="none">
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.brand.ink,
    overflow: 'hidden',
  },
  heartBurst: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
  },
  meta: {
    position: 'absolute',
    left: 14,
    right: 78,
    bottom: 78,
    gap: 6,
  },
  liveBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent.live,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
  },
  newBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand.cyan,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 4,
  },
  newBadgeText: {
    color: colors.brand.ink,
    fontWeight: '900',
    fontSize: 10,
  },
  author: {
    color: colors.text.inverse,
    fontWeight: '800',
    fontSize: 16,
  },
  caption: {
    color: colors.text.onDark,
    fontSize: 14,
    lineHeight: 20,
  },
  location: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
  },
  music: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  shopTag: {
    position: 'absolute',
    left: 14,
    bottom: 18,
    backgroundColor: colors.text.inverse,
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  shopTagIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopTagLabel: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  shopTagPrice: {
    color: colors.text.primary,
    fontWeight: '900',
    fontSize: 14,
  },
});
