import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { VideoPlayer } from 'expo-video';

import { colors } from '@/shared/theme/colors';
import type { FeedItem } from '@/modules/feed/domain/types';
import { DEFAULT_OVERLAY_TRANSFORM } from '@/modules/create/domain/overlay';
import { LockedOverlayText } from '@/modules/create/ui/LockedOverlayText';
import { LockedTextStickerLayer } from '@/modules/create/ui/LockedTextStickerLayer';
import { LockedStickerOverlay } from '@/modules/create/ui/LockedStickerOverlay';
import { type StickerOverlayObject } from '@/modules/create/domain/editorComposition';

import { useMusicPlayerStore } from '@/modules/music/state/music-player-store';
import { openListenScreenNow } from '@/shared/navigation/safeNavigate';
import { useFeedChromeStore } from '@/modules/feed/state/feed-chrome-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { Avatar } from '@/shared/components/Avatar';
import { RightActionBar } from './RightActionBar';
import { FeedSeekBar } from './FeedSeekBar';
import { FeedPinchZoomLayer } from './FeedPinchZoomLayer';
import { FeedMediaRenderer } from './FeedMediaRenderer';
import { ExpandableCaption } from './ExpandableCaption';
import { IOS_SPRING, clampPagerX, snapPagerIndex } from './feedMotion';
import { hasFeedMusic } from '@/modules/feed/domain/feedMusic';
import { openFeedMediaViewer } from '@/modules/feed/state/feed-media-viewer-store';


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
  bottomMetaInset?: number;
  bottomActionsInset?: number;
  bottomSeekInset?: number;
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
  bottomMetaInset = 0,
  bottomActionsInset = 0,
  bottomSeekInset = 0,
}: Props) {
  const gallery = useMemo(() => galleryOf(item), [item]);
  const multi = gallery.length > 1;
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const activeUri = gallery[0];
  const primaryMediaId = item.editorMedia?.[0]?.id;
  const canonicalSticker = useMemo(
    () => item.overlays?.find(
      (overlay): overlay is StickerOverlayObject =>
        overlay.type === 'sticker' && overlay.mediaId === primaryMediaId,
    ),
    [item.overlays, primaryMediaId],
  );
  // Real photo aspect ratio (from upload pixels) so image posts are never cropped.
  const imageAspectRatio = useMemo(() => {
    const editorCover = item.editorMedia?.[0];
    if (editorCover?.width && editorCover.height && editorCover.height > 0) {
      return editorCover.width / editorCover.height;
    }
    if (item.imageWidth && item.imageHeight && item.imageHeight > 0) {
      return item.imageWidth / item.imageHeight;
    }
    return undefined;
  }, [item.editorMedia, item.imageWidth, item.imageHeight]);
  // รูปแสดงตามสัดส่วนพิกเซลจริงของไฟล์ (contain ในจอ ไม่ crop/ขยายซูม)
  // วิดีโอไม่ใช้ mediaLayout — FeedVideoLayer ขยายเต็มการ์ด (contain เหมือนรูปภาพ ไม่ crop/ซูม)
  const mediaLayout = useMemo(() => {
    if (imageAspectRatio) {
      let w = screenWidth;
      let h = w / imageAspectRatio;
      if (h > height) {
        h = height;
        w = h * imageAspectRatio;
      }
      return { width: Math.round(w), height: Math.round(h) };
    }
    return { width: screenWidth, height };
  }, [height, imageAspectRatio, screenWidth]);
  const authorKey = item.authorHandle.replace(/^@/, '');

  const myProfile = useLoyaltyStore((s) => s.profile);
  const authorName = item.isUserPost ? myProfile.displayName || item.author : item.author;
  const avatarUri = item.isUserPost
    ? myProfile.avatarUri
    : item.authorAvatarUri
      ?? `https://i.pravatar.cc/150?u=boommall-${authorKey.toLowerCase()}`;
  const playFromFeedMusic = useMusicPlayerStore((s) => s.playFromFeedMusic);
  const musicPlaying = useMusicPlayerStore((s) => s.playing);
  const musicTrackTitle = useMusicPlayerStore((s) => s.track?.title);
  const expandMusic = useMusicPlayerStore((s) => s.expand);
  const chromeHidden = useFeedChromeStore((s) => s.chromeHidden);
  const captionsEnabled = useFeedChromeStore((s) => s.captionsEnabled);
  const setChromeHidden = useFeedChromeStore((s) => s.setChromeHidden);
  const setMediaZoomed = useFeedChromeStore((s) => s.setMediaZoomed);
  const hasMusic = hasFeedMusic(item.musicTitle);
  const listenTitle = hasMusic ? item.musicTitle : `Original Sound — ${authorName}`;
  const listeningNow = musicPlaying && musicTrackTitle === listenTitle;

  const openListenMode = () => {
    // Lock + push immediately so a double-tap cannot stack two /listen modals
    // (previously we awaited audio load first — second tap slipped through).
    if (!openListenScreenNow()) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    expandMusic();
    const title = hasMusic ? item.musicTitle : listenTitle;
    void playFromFeedMusic(title, authorName);
  };
  const caption = item.caption?.trim() ?? '';

  const centerIconScale = useSharedValue(0);
  const centerIconOpacity = useSharedValue(0);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const widthSV = useSharedValue(screenWidth);
  const tabCountSV = useSharedValue(tabCount);
  const panStartPagerX = useSharedValue(0);
  const draggingTabs = useSharedValue(0);
  const zoomed = useSharedValue(0);

  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [, setIsPaused] = useState(false);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [centerIconName, setCenterIconName] = useState<'play' | 'pause'>('play');
  const isScrubbingRef = useRef(false);
  /** Timestamp of the last media tap — used to detect a double-tap like. */
  const lastTapTimeRef = useRef(0);


  const onMediaZoomChange = useCallback(
    (next: boolean) => {
      zoomed.value = next ? 1 : 0;
      setMediaZoomed(next);
      setChromeHidden(next);
    },
    [setChromeHidden, setMediaZoomed, zoomed],
  );

  useEffect(() => {
    zoomed.value = 0;
    setMediaZoomed(false);
  }, [item.id, setMediaZoomed, zoomed]);

  useEffect(() => () => setMediaZoomed(false), [setMediaZoomed]);

  useEffect(() => {
    widthSV.value = screenWidth;
  }, [screenWidth, widthSV]);

  useEffect(() => {
    tabCountSV.value = tabCount;
  }, [tabCount, tabCountSV]);

  useEffect(() => {
    setCaptionExpanded(false);
  }, [item.id]);

  useEffect(() => {
    if (!isActive) setCaptionExpanded(false);
  }, [isActive]);

  // A manual pause belongs to the currently visible reel only. Reset it only
  // when this card *becomes active again* (the user scrolled away and came
  // back) — never while it stays active, or autoplay would restart a video the
  // user explicitly paused. FlatList's viewability drives the threshold.
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      // Reset is intentionally sync: FlatList viewability drives it, so the
      // next autoplay of this reel starts from a clean slate.
      setIsManuallyPaused(false);
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  // Reset playback state whenever the clip changes.
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPaused(false);
    isScrubbingRef.current = false;
  }, [item.id]);

  // Drive the seek bar from the player's real time updates.
  useEffect(() => {
    if (!player) return;
    const timeSub = player.addListener('timeUpdate', ({ currentTime: t }) => {
      const d = player.duration;
      if (d > 0) {
        setDuration(d);
        setCurrentTime(t);
      }
    });
    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      setIsPaused(!isPlaying);
    });
    return () => {
      timeSub.remove();
      playingSub.remove();
    };
  }, [player]);

  const burstCenterIcon = (name: 'play' | 'pause') => {
    setCenterIconName(name);
    centerIconScale.value = 0.5;
    centerIconOpacity.value = 1;
    centerIconScale.value = withSequence(
      withTiming(1.1, { duration: 160, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 100 }),
    );
    centerIconOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 450, easing: Easing.out(Easing.ease) }),
    );
  };

  const setVideoPlaying = (playing: boolean) => {
    if (!player) return;
    if (playing) {
      setIsManuallyPaused(false);
      player.play();
      setIsPaused(false);
      burstCenterIcon('pause');
    } else {
      player.pause();
      setIsManuallyPaused(true);
      setIsPaused(true);
      burstCenterIcon('play');
    }
  };

  const handleVideoTap = () => {
    console.log('[VIDEO_DEBUG] TAP_RECEIVED', { feedId: item.id, hasPlayer: Boolean(player) });
    if (!player) return;
    if (player.playing) {
      console.log('[VIDEO_DEBUG] PAUSE_CALLED', { feedId: item.id });
      setVideoPlaying(false);
    } else {
      console.log('[VIDEO_DEBUG] PLAY_CALLED', { feedId: item.id });
      setVideoPlaying(true);
    }
  };

  /**
   * Single tap toggles play/pause immediately (no waiting for the double-tap
   * recognizer). A second tap within 280ms is treated as a double-tap like and
   * undoes the first tap's play/pause toggle, exactly like TikTok/iG.
   */
  const handleMediaTap = () => {
    // Tap timestamp is intentionally impure (event handler, not render).
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const isDoubleTap = lastTapTimeRef.current !== 0 && now - lastTapTimeRef.current < 280;
    lastTapTimeRef.current = now;

    if (isDoubleTap) {
      lastTapTimeRef.current = 0;
      // Undo the single-tap toggle from the first tap of this double-tap.
      if (player) {
        if (player.playing) setVideoPlaying(false);
        else setVideoPlaying(true);
      }
      burstHeart();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (!liked) onLike?.();
      return;
    }

    restoreChrome();
    handleVideoTap();
  };

  const handleScrub = (ratio: number) => {
    if (player) {
      const d = player.duration;
      if (d > 0) {
        player.currentTime = ratio * d;
        setCurrentTime(ratio * d);
      }
    }
  };

  const handleSeek = (ratio: number) => {
    if (!player) return;
    const d = player.duration;
    if (d > 0) {
      player.currentTime = ratio * d;
      setCurrentTime(ratio * d);
      // Start playing automatically after seeking/releasing the seek bar
      player.play();
    }
  };

  const handleScrubStart = () => {
    isScrubbingRef.current = true;
    // Pause player during scrubbing interaction
    if (player && player.playing) {
      player.pause();
    }
  };

  const handleScrubEnd = () => {
    isScrubbingRef.current = false;
  };

  const centerIconStyle = useAnimatedStyle(() => ({
    opacity: centerIconOpacity.value,
    transform: [{ scale: centerIconScale.value }],
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

  const openLongPressMenu = () => {
    if (!onLongPressMenu) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPressMenu();
  };

  const restoreChrome = () => {
    if (chromeHidden) setChromeHidden(false);
  };

  const longPress = Gesture.LongPress()
    .minDuration(400)
    .maxDistance(12)
    .onStart(() => {
      runOnJS(openLongPressMenu)();
    });

  // This recognizer lives on the media layer, below every interactive overlay.
  // `maxDistance` cancels it as soon as the finger becomes a scroll/swipe.
  //
  // NOTE: we deliberately do NOT compose a `numberOfTaps(2)` tap here. With
  // `Gesture.Exclusive(doubleTap, …)` the single tap had to wait ~500ms for the
  // double tap to fail, which made play/pause feel laggy. Double-tap is instead
  // detected manually inside handleMediaTap via a 280ms timestamp window, so a
  // single tap responds instantly.
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .maxDistance(10)
    // eslint-disable-next-line react-hooks/refs -- gesture callback (not render) closes over refs.
    .onEnd((_event, success) => {
      if (!success) return;
      runOnJS(handleMediaTap)();
    });

  const mediaGesture = Gesture.Exclusive(longPress, singleTap);


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
    draggingTabs.value = 0;
    // Keep the whole snap on the UI thread. Updating the tab store here used to
    // re-render/focus the incoming lane while the spring was still around 75%.
    pagerX.value = withSpring(
      -idx * w,
      { ...IOS_SPRING, velocity: vx },
      (finished) => {
        if (finished) runOnJS(commitTab)(idx);
      },
    );
  };

  const horizontalSwipe = Gesture.Pan()
    .enabled(enableProfileSwipe || enableTabSwipeLeft)
    // The pager gesture wraps the whole card, including the action buttons.
    // On iOS its native recognizer must not cancel a Pressable's touch stream.
    .cancelsTouchesInView(false)
    // The media tap is mounted in a nested GestureDetector. Without this
    // cross-detector relation, iOS lets the outer pan recognizer block the tap.
    .simultaneousWithExternalGesture(singleTap, longPress)
    .activeOffsetX([-12, 12])
    .failOffsetY([-22, 22])
    .onStart(() => {
      panStartPagerX.value = pagerX.value;
      draggingTabs.value = 0;
    })
    .onUpdate((e) => {
      if (zoomed.value > 0.5) {
        pagerX.value = panStartPagerX.value;
        return;
      }
      const w = widthSV.value;
      const pages = tabCountSV.value;
      const dx = e.translationX;

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
      if (zoomed.value > 0.5) {
        pagerX.value = withSpring(panStartPagerX.value, IOS_SPRING);
        return;
      }
      const w = widthSV.value;
      const dx = e.translationX;
      const vx = e.velocityX;

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

  return (
    <View style={{ height }}>
      <GestureDetector gesture={horizontalSwipe}>
        <View style={[styles.card, { height: '100%' }]}>
        <FeedPinchZoomLayer
          resetKey={`${item.id}:${isActive ? 'active' : 'inactive'}`}
          enabled={Boolean(item.videoUri || activeUri)}
          onZoomChange={onMediaZoomChange}
          contentGesture={mediaGesture}
        >
          <FeedMediaRenderer
            item={item}
            gallery={gallery}
            width={screenWidth}
            height={Math.min(height, Math.round(screenWidth * 1.18))}
            imageLayout={mediaLayout}
            isActive={isActive}
            isManuallyPaused={isManuallyPaused}
            onPlayerReady={setPlayer}
            onOpenImage={(index) => openFeedMediaViewer(
              gallery,
              index,
              item.editorMedia?.map((media) => media.id),
              item.overlays,
              item.editorMedia,
            )}
          />
        </FeedPinchZoomLayer>

        {!chromeHidden ? (
          <LinearGradient
            colors={['transparent', colors.feed.captionScrim]}
            locations={[0, 1]}
            style={styles.captionScrim}
            pointerEvents="none"
          />
        ) : null}

        {item.overlayText?.trim() && captionsEnabled ? (
          <LockedOverlayText
            text={item.overlayText}
            color={item.overlayTextColor ?? '#fff'}
            transform={item.overlayTransform ?? DEFAULT_OVERLAY_TRANSFORM}
            fontSize={36}
          />
        ) : null}

        {item.overlayStickers?.length ? (
          <LockedTextStickerLayer stickers={item.overlayStickers} />
        ) : null}

        {!multi && canonicalSticker ? (
          <LockedStickerOverlay
            sticker={canonicalSticker.sticker}
            transform={canonicalSticker.transform}
          />
        ) : null}

        <Animated.View style={[styles.heartBurst, heartStyle]} pointerEvents="none">

          <Ionicons name="heart" size={96} color={colors.brand.pink} />
        </Animated.View>

        {!chromeHidden ? (
          <View style={[styles.meta, { bottom: 28 + bottomMetaInset }]} pointerEvents="box-none">
            {item.isLive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
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

            <View style={styles.authorRow}>
              <Pressable
                onPress={onAvatar}
                onLongPress={onCall ? () => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onCall();
                } : undefined}
                accessibilityRole="button"
                accessibilityLabel={`ดูโปรไฟล์ ${authorName}`}
              >
                <Avatar
                  uri={avatarUri}
                  initial={authorName.slice(0, 1)}
                  size={40}
                  radius={18}
                  borderColor="#fff"
                  borderWidth={1.5}
                />
              </Pressable>
              <Pressable
                onPress={onAvatar}
                onLongPress={onCall ? () => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onCall();
                } : undefined}
                style={styles.authorNameButton}
                accessibilityRole="button"
                accessibilityLabel={`ดูโปรไฟล์ ${authorName}`}
              >
                <Text style={styles.author} numberOfLines={1}>
                  {authorName}
                </Text>
              </Pressable>
            </View>

            <ExpandableCaption
              key={item.id}
              text={caption}
              maxExpandedHeight={Math.max(160, height * 0.5)}
              onExpandedChange={setCaptionExpanded}
            />

            {hasMusic && !captionExpanded ? (
              <Pressable onPress={openListenMode} hitSlop={6}>
                <Text style={styles.music} numberOfLines={1}>
                  ♪ {item.musicTitle}{listeningNow ? ' · กำลังเล่น' : ''}
                </Text>
              </Pressable>
            ) : captionExpanded ? (
              <Text style={styles.location} numberOfLines={1}>
                📍 {item.location} · {item.product.tier}
              </Text>
            ) : null}
            {multi ? (
              <Text style={styles.photoCount}>
                {gallery.length} รูป · แตะรูปเพื่อดูเต็มจอ
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
            musicActive={listeningNow}
            bottomOffset={bottomActionsInset}
          />
        ) : null}

        {item.videoUri ? (
          <Animated.View style={[styles.centerIcon, centerIconStyle]} pointerEvents="none">
            <Ionicons
              name={centerIconName === 'play' ? 'play' : 'pause'}
              size={72}
              color="rgba(255,255,255,0.92)"
            />
          </Animated.View>
        ) : null}

        </View>
      </GestureDetector>

      {/* Seek bar placed outside horizontalSwipe GestureDetector to receive touch events */}
      {item.videoUri && !chromeHidden ? (
        <FeedSeekBar
          progress={duration > 0 ? currentTime / duration : 0}
          currentTime={currentTime}
          duration={duration}
          onScrub={handleScrub}
          onSeek={handleSeek}
          onScrubStart={handleScrubStart}
          onScrubEnd={handleScrubEnd}
          bottomOffset={bottomSeekInset}
        />
      ) : null}
    </View>
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
  /** Full-bleed stage that centers the photo without cropping (contain). */
  imageStage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.ink,
  },
  imageContain: {
    width: '100%',
    height: '100%',
  },
  /**
   * Full-bleed stage that centers the video — identical to `imageStage`.
   * Video uses contentFit="contain" so it keeps its original aspect ratio
   * (no zoom / no edge crop), exactly like photos on the feed.
   */
  videoStage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.ink,
  },
  /** Full-bleed cover — fills viewport, may crop edges (aspectFill). */
  imageCover: {
    ...StyleSheet.absoluteFill,
  },
  /** Slight low-height gradient strictly behind bottom caption/author text. */
  captionScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
    zIndex: 9,
  },
  heartBurst: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },

  centerIcon: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 11,
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
  liveText: { color: '#fff', fontWeight: '900', fontSize: 13 },
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
    fontSize: 15,
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
    fontSize: 18,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 4,
  },
  authorNameButton: {
    flexShrink: 1,
  },
  caption: {
    color: colors.text.onDark,
    fontSize: 16,
    lineHeight: 22,
  },
  captionMore: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
  },
  location: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  music: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
  },
  photoCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
  },
});
