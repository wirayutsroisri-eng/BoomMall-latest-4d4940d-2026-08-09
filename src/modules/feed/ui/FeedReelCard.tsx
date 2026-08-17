import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors } from '@/shared/theme/colors';
import type { FeedItem } from '@/modules/feed/domain/types';
import { DEFAULT_OVERLAY_TRANSFORM } from '@/modules/create/domain/overlay';
import { LockedOverlayText } from '@/modules/create/ui/LockedOverlayText';
import { useMusicPlayerStore } from '@/modules/music/state/music-player-store';
import { openListenScreenNow } from '@/shared/navigation/safeNavigate';
import { useFeedChromeStore } from '@/modules/feed/state/feed-chrome-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { Avatar } from '@/shared/components/Avatar';
import { RightActionBar } from './RightActionBar';
import { IOS_SPRING, clampPagerX, snapPagerIndex } from './feedMotion';

/** แคปชันยาวเกินนี้ → แสดงปุ่มย่อ/ขยาย */
const CAPTION_COLLAPSE_CHARS = 42;

function galleryOf(item: FeedItem): string[] {
  if (item.imageUris?.length) return item.imageUris;
  if (item.imageUri) return [item.imageUri];
  return [];
}

type Props = {
  item: FeedItem;
  height: number;
  isActive?: boolean;
  onTip?: () => void;
  onComment: () => void;
  onShare?: () => void;
  onCall?: () => void;
  onLike?: () => void;
  liked?: boolean;
  likes?: number;
  onLongPressMenu?: () => void;
  onAvatar?: () => void;
  /** ปักตะกร้า / พิกัดสินค้า — เปิดชีตซื้อ */
  onProduct?: () => void;
  /** ปัดซ้ายแรงๆ บนสำหรับคุณ → เปิดโปรไฟล์ (navigate ไม่ใช่ pager ค้าง) */
  enableProfileSwipe?: boolean;
  enableTabSwipeLeft?: boolean;
  screenWidth: number;
  tabCount: number;
  pagerX: SharedValue<number>;
  onOpenProfile?: () => void;
  onCommitTabIndex?: (index: number) => void;
};

/**
 * แนวนอนมีหน้าที่เดียวต่อทิศทาง:
 * - ปัดเปลี่ยนแท็บ → ขยับ pagerX (เห็นหน้าข้าง)
 * - ปัดซ้ายบนสำหรับคุณ → navigate ไปโปรไฟล์ (ไม่แย่ง translate กับแท็บ)
 */
export function FeedReelCard({
  item,
  height,
  isActive,
  onTip,
  onComment,
  onShare,
  onCall,
  onLike,
  liked,
  likes,
  onLongPressMenu,
  onAvatar,
  onProduct,
  enableProfileSwipe,
  enableTabSwipeLeft = true,
  screenWidth,
  tabCount,
  pagerX,
  onOpenProfile,
  onCommitTabIndex,
}: Props) {
  const gallery = useMemo(() => galleryOf(item), [item]);
  const multi = gallery.length > 1;
  const [page, setPage] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const activeUri = gallery[Math.min(page, Math.max(gallery.length - 1, 0))];
  const authorKey = item.authorHandle.replace(/^@/, '');
  const myAvatarUri = useLoyaltyStore((s) => s.profile.avatarUri);
  const avatarUri = item.isUserPost
    ? myAvatarUri
    : `https://i.pravatar.cc/150?u=boommall-${authorKey.toLowerCase()}`;
  const playFromFeedMusic = useMusicPlayerStore((s) => s.playFromFeedMusic);
  const musicPlaying = useMusicPlayerStore((s) => s.playing);
  const musicTrackTitle = useMusicPlayerStore((s) => s.track?.title);
  const expandMusic = useMusicPlayerStore((s) => s.expand);
  const chromeHidden = useFeedChromeStore((s) => s.chromeHidden);
  const captionsEnabled = useFeedChromeStore((s) => s.captionsEnabled);
  const playbackRate = useFeedChromeStore((s) => s.playbackRate);
  const setChromeHidden = useFeedChromeStore((s) => s.setChromeHidden);

  const openListenMode = () => {
    // Lock + push immediately so a double-tap cannot stack two /listen modals
    // (previously we awaited audio load first — second tap slipped through).
    if (!openListenScreenNow()) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    expandMusic();
    void playFromFeedMusic(item.musicTitle, item.author);
  };
  const caption = item.caption?.trim() ?? '';
  const captionCollapsible = caption.length > CAPTION_COLLAPSE_CHARS;

  const progress = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const widthSV = useSharedValue(screenWidth);
  const tabCountSV = useSharedValue(tabCount);
  const panStartPagerX = useSharedValue(0);
  const draggingTabs = useSharedValue(0);

  useEffect(() => {
    widthSV.value = screenWidth;
  }, [screenWidth, widthSV]);

  useEffect(() => {
    tabCountSV.value = tabCount;
  }, [tabCount, tabCountSV]);

  useEffect(() => {
    setPage(0);
    setCaptionExpanded(false);
  }, [item.id]);

  useEffect(() => {
    if (!isActive) setCaptionExpanded(false);
  }, [isActive]);

  useEffect(() => {
    const duration = Math.max(2500, Math.round(15000 / playbackRate));
    if (isActive) {
      progress.value = 0;
      progress.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
    return () => cancelAnimation(progress);
  }, [isActive, progress, page, playbackRate]);

  const toggleCaption = () => {
    if (!captionCollapsible) return;
    void Haptics.selectionAsync();
    setCaptionExpanded((v) => !v);
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));

  const burstHeart = () => {
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
  };

  const onDoubleTapLike = () => {
    burstHeart();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!liked) onLike?.();
  };

  const openLongPressMenu = () => {
    if (!onLongPressMenu) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPressMenu();
  };

  const restoreChrome = () => {
    if (chromeHidden) setChromeHidden(false);
  };

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(onDoubleTapLike)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(400)
    .maxDistance(12)
    .onStart(() => {
      runOnJS(openLongPressMenu)();
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(restoreChrome)();
    });

  const goNextPhoto = () => {
    setPage((p) => Math.min(gallery.length - 1, p + 1));
    void Haptics.selectionAsync();
  };
  const goPrevPhoto = () => {
    setPage((p) => Math.max(0, p - 1));
    void Haptics.selectionAsync();
  };

  const openProfile = () => {
    onOpenProfile?.();
  };
  const commitTab = (index: number) => {
    onCommitTabIndex?.(index);
  };

  const settlePager = (vx: number) => {
    'worklet';
    const w = widthSV.value;
    const pages = tabCountSV.value;
    const idx = snapPagerIndex(pagerX.value, w, pages, vx);
    pagerX.value = withSpring(-idx * w, { ...IOS_SPRING, velocity: vx });
    draggingTabs.value = 0;
    runOnJS(commitTab)(idx);
  };

  const horizontalSwipe = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-22, 22])
    .onStart(() => {
      panStartPagerX.value = pagerX.value;
      draggingTabs.value = 0;
    })
    .onUpdate((e) => {
      const w = widthSV.value;
      const pages = tabCountSV.value;
      const dx = e.translationX;

      if (multi) {
        if (page === 0 && dx > 0) {
          draggingTabs.value = 1;
          pagerX.value = clampPagerX(panStartPagerX.value + dx, w, pages);
        } else if (page === gallery.length - 1 && dx < 0 && enableTabSwipeLeft) {
          draggingTabs.value = 1;
          pagerX.value = clampPagerX(panStartPagerX.value + dx, w, pages);
        } else {
          draggingTabs.value = 0;
          pagerX.value = panStartPagerX.value;
        }
        return;
      }

      // โปรไฟล์ไม่ขยับ pager ระหว่างลาก — กันจอค้าง/หัวหาย
      if (dx < -10 && enableProfileSwipe) {
        draggingTabs.value = 0;
        pagerX.value = panStartPagerX.value;
        return;
      }

      if (dx > 10 || (dx < -10 && enableTabSwipeLeft)) {
        draggingTabs.value = 1;
        pagerX.value = clampPagerX(panStartPagerX.value + dx, w, pages);
      } else {
        draggingTabs.value = 0;
        pagerX.value = panStartPagerX.value;
      }
    })
    .onEnd((e) => {
      const w = widthSV.value;
      const dx = e.translationX;
      const vx = e.velocityX;

      if (multi) {
        if (draggingTabs.value === 1) {
          settlePager(vx);
          return;
        }
        if (page < gallery.length - 1 && (dx < -56 || vx < -420)) {
          runOnJS(goNextPhoto)();
          return;
        }
        if (page > 0 && (dx > 56 || vx > 420)) {
          runOnJS(goPrevPhoto)();
          return;
        }
        if (
          enableProfileSwipe &&
          page === gallery.length - 1 &&
          (dx < -w * 0.28 || vx < -750)
        ) {
          pagerX.value = panStartPagerX.value;
          runOnJS(openProfile)();
          return;
        }
        pagerX.value = withSpring(panStartPagerX.value, IOS_SPRING);
        return;
      }

      if (draggingTabs.value === 1) {
        settlePager(vx);
        return;
      }

      if (enableProfileSwipe && (dx < -w * 0.28 || vx < -750 || dx + vx * 0.16 < -w * 0.45)) {
        pagerX.value = panStartPagerX.value;
        runOnJS(openProfile)();
        return;
      }

      if (enableTabSwipeLeft || dx > 0) {
        settlePager(vx);
        return;
      }

      pagerX.value = withSpring(panStartPagerX.value, IOS_SPRING);
    });

  const composedGesture = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTap, singleTap),
    longPress,
    horizontalSwipe,
  );

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={[styles.card, { height }]}>
        {activeUri ? (
          <Image source={{ uri: activeUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={item.gradient} style={StyleSheet.absoluteFill} />
        )}
        {!chromeHidden ? (
          <LinearGradient
            colors={[colors.feed.gradientTop, 'transparent', colors.feed.gradientBottom]}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {multi && !chromeHidden ? (
          <View style={styles.pageDots} pointerEvents="none">
            {gallery.map((_, i) => (
              <View key={i} style={[styles.pageDot, i === page && styles.pageDotActive]} />
            ))}
          </View>
        ) : null}

        {item.overlayText?.trim() && page === 0 && captionsEnabled ? (
          <LockedOverlayText
            text={item.overlayText}
            color={item.overlayTextColor ?? '#fff'}
            transform={item.overlayTransform ?? DEFAULT_OVERLAY_TRANSFORM}
            fontSize={36}
          />
        ) : null}

        <Animated.View style={[styles.heartBurst, heartStyle]} pointerEvents="none">
          <Ionicons name="heart" size={96} color={colors.brand.pink} />
        </Animated.View>

        {!chromeHidden ? (
          <View style={styles.meta}>
            {item.isLive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : null}
            {item.isUserPost ? (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>โพสต์ของคุณ</Text>
              </View>
            ) : null}

            {onProduct && item.product ? (
              <Pressable
                style={styles.productPin}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onProduct();
                }}
                hitSlop={6}
                accessibilityLabel="ปักตะกร้า พิกัดตรงนี้"
              >
                <View style={styles.productPinIcon}>
                  <Ionicons name="bag-handle" size={14} color="#fff" />
                </View>
                <Text style={styles.productPinText} numberOfLines={1}>
                  พิกัดตรงนี้
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={styles.authorRow}
              onPress={onAvatar}
              onLongPress={
                onCall
                  ? () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      onCall();
                    }
                  : undefined
              }
              hitSlop={6}
            >
              <Avatar
                uri={avatarUri}
                initial={item.author.slice(0, 1)}
                size={36}
                radius={18}
                borderColor="#fff"
                borderWidth={1.5}
              />
              <Text style={styles.author} numberOfLines={1}>
                {item.author}
              </Text>
            </Pressable>

            {caption ? (
              <Pressable
                onPress={toggleCaption}
                disabled={!captionCollapsible}
              >
                {captionExpanded || !captionCollapsible ? (
                  <Text style={styles.caption}>
                    {caption}
                    {captionCollapsible ? (
                      <Text style={styles.captionMore}>  ย่อ</Text>
                    ) : null}
                  </Text>
                ) : (
                  <Text style={styles.caption}>
                    {`${caption.slice(0, CAPTION_COLLAPSE_CHARS).trimEnd()}… `}
                    <Text style={styles.captionMore}>เพิ่มเติม</Text>
                  </Text>
                )}
              </Pressable>
            ) : null}

            {!captionExpanded ? (
              <Pressable onPress={openListenMode} hitSlop={6}>
                <Text style={styles.music} numberOfLines={1}>
                  ♪ {item.musicTitle} · แตะฟังเพลงยาว
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.location} numberOfLines={1}>
                📍 {item.location} · {item.product.tier}
              </Text>
            )}
            {multi ? (
              <Text style={styles.photoCount}>
                รูป {page + 1}/{gallery.length} · ปัดซ้าย/ขวาดูรูปในโพสต์
              </Text>
            ) : null}
          </View>
        ) : null}

        {!chromeHidden ? (
          <RightActionBar
            tips={item.tips ?? 0}
            comments={item.comments}
            tipped={(item.myTipTotal ?? 0) > 0}
            onTip={onTip}
            onComment={onComment}
            onShare={onShare}
            shares={item.shares}
            onLike={onLike}
            liked={liked}
            likes={likes ?? item.likes}
            onMusic={openListenMode}
            musicActive={musicTrackTitle !== item.musicTitle || musicPlaying}
          />
        ) : null}

        {!chromeHidden ? (
          <View style={styles.progressTrack} pointerEvents="none">
            <Animated.View style={[styles.progressFill, progressStyle]} />
          </View>
        ) : null}
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
  pageDots: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    zIndex: 8,
  },
  pageDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  pageDotActive: { backgroundColor: '#fff' },
  heartBurst: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  meta: {
    position: 'absolute',
    left: 14,
    right: 72,
    bottom: 28,
    gap: 5,
    zIndex: 10,
  },
  liveBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent.live,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  newBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  newBadgeText: { color: colors.brand.ink, fontWeight: '900', fontSize: 11 },
  /** TikTok shop pin — เหนือชื่อผู้ใช้ มุมล่างซ้าย */
  productPin: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '92%',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: 6,
    marginBottom: 2,
  },
  productPinIcon: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: colors.accent.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productPinText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    flexShrink: 1,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  author: {
    flexShrink: 1,
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 4,
  },
  caption: {
    color: colors.text.onDark,
    fontSize: 14,
    lineHeight: 19,
  },
  captionMore: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
  },
  location: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
  },
  music: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  photoCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
  },
});
