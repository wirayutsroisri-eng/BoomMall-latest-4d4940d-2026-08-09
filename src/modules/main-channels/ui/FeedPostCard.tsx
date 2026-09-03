import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { VideoPlayer } from 'expo-video';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Avatar } from '@/shared/components/Avatar';
import type { FeedItem } from '@/modules/feed/domain/types';
import { FeedPinchZoomLayer } from '@/modules/feed/ui/FeedPinchZoomLayer';
import { FeedSeekBar } from '@/modules/feed/ui/FeedSeekBar';
import { FeedVideoLayer } from '@/modules/feed/ui/FeedVideoLayer';
import { PostProductBar } from '@/modules/feed/ui/PostProductBar';
import { MultiImageGrid } from '@/modules/feed/ui/MultiImageGrid';
import { openFeedMediaViewer } from '@/modules/feed/state/feed-media-viewer-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';

type Props = {
  item: FeedItem;
  active: boolean;
  channel: 'feed' | 'nearby' | 'jobs' | 'secondhand';
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
  onAuthor: () => void;
  onMenu: () => void;
  onChat?: () => void;
  onProduct?: () => void;
};

function compactNumber(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K` : String(value);
}

function publishedLabel(iso?: string) {
  if (!iso) return 'ล่าสุด';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'ล่าสุด';
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ชม.ที่แล้ว`;
  const days = Math.floor(minutes / 1440);
  if (days < 30) return `${days} วันที่แล้ว`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} เดือนที่แล้ว`;
  return `${Math.floor(months / 12)} ปีที่แล้ว`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export const FeedPostCard = memo(function FeedPostCard({
  item,
  active,
  channel,
  onLike,
  onComment,
  onShare,
  onSave,
  onAuthor,
  onMenu,
  onChat,
  onProduct,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const ownAvatarUri = useLoyaltyStore((state) => state.profile.avatarUri);
  const facebookFeed = channel === 'feed';
  const cardWidth = Math.max(280, windowWidth);
  const gallery = useMemo(
    () => item.imageUris?.filter(Boolean) ?? (item.imageUri ? [item.imageUri] : []),
    [item.imageUri, item.imageUris],
  );
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const visibleCaption = item.caption.trim() === 'โพสต์ใหม่จาก BoomMall' ? '' : item.caption;
  const [loadedImageSize, setLoadedImageSize] = useState<{ width: number; height: number } | null>(null);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoPlayer, setVideoPlayer] = useState<VideoPlayer | null>(null);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<VideoPlayer | null>(null);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const singleImageRef = useRef<View | null>(null);
  const videoBoxRef = useRef<View | null>(null);
  const dateLabel = item.publishStatus === 'uploading'
    ? 'กำลังอัปโหลด…'
    : item.publishStatus === 'failed'
      ? 'อัปโหลดไม่สำเร็จ'
      : publishedLabel(item.createdAt);
  const imageMedia = useMemo(
    () => item.editorMedia?.filter((media) => media.type === 'image') ?? [],
    [item.editorMedia],
  );
  const imageAssets = useMemo(
    () => item.mediaAssets?.filter((asset) => asset.type === 'image') ?? [],
    [item.mediaAssets],
  );
  const primaryImage = imageAssets[0] ?? imageMedia[0];
  const primaryImageWidth = primaryImage?.width ?? item.imageWidth ?? loadedImageSize?.width;
  const primaryImageHeight = primaryImage?.height ?? item.imageHeight ?? loadedImageSize?.height;
  const imageAspect = primaryImageWidth && primaryImageHeight
    ? primaryImageWidth / primaryImageHeight
    : 4 / 3;
  const safetyMaxHeight = Math.min(760, Math.round(windowHeight * 0.82));
  // Facebook-like feed preview: follow the source ratio until it becomes very
  // tall, then let the frame crop the overflow instead of squeezing the image.
  const facebookMediaMaxHeight = Math.min(safetyMaxHeight, Math.round(cardWidth * 1.62));
  const singleImageHeight = Math.round(clamp(
    cardWidth / imageAspect,
    facebookFeed ? cardWidth * 0.56 : 120,
    facebookFeed ? facebookMediaMaxHeight : safetyMaxHeight,
  ));
  const imageOrientations = imageAssets.length ? imageAssets : imageMedia;
  const twoLandscapeImages = gallery.length === 2
    && imageOrientations.slice(0, 2).every((media) => media.width && media.height && media.width / media.height > 1.15);
  const gridNaturalHeight = gallery.length === 2 && twoLandscapeImages
    ? imageOrientations.slice(0, 2).reduce((height, media) => height + cardWidth / (media.width! / media.height!), 2)
    : gallery.length === 2
      ? ((cardWidth - 2) / 2) / imageAspect
      : cardWidth / imageAspect;
  const gridHeight = Math.round(clamp(
    gridNaturalHeight,
    gallery.length === 2 ? 180 : cardWidth * 0.76,
    Math.min(safetyMaxHeight, cardWidth * 1.18),
  ));
  const videoAsset = item.mediaAssets?.find((asset) => asset.type === 'video');
  const videoEditor = item.editorMedia?.find((media) => media.type === 'video');
  const storedVideoWidth = videoAsset?.width ?? videoEditor?.width;
  const storedVideoHeight = videoAsset?.height ?? videoEditor?.height;
  const storedVideoAspect = storedVideoWidth && storedVideoHeight
    ? storedVideoWidth / storedVideoHeight
    : null;
  const runtimeVideoAspect = videoSize?.width && videoSize.height
    ? videoSize.width / videoSize.height
    : null;
  // iPhone MOV tracks can report the encoded landscape dimensions before the
  // rotation transform. When that conflicts with the persisted presentation
  // orientation, the presentation metadata is what the user actually saw.
  const runtimeOrientationConflicts = runtimeVideoAspect && storedVideoAspect
    ? (runtimeVideoAspect > 1) !== (storedVideoAspect > 1)
    : false;
  const isQuickTimeMov = videoAsset?.mimeType === 'video/quicktime'
    || /\.mov(?:$|[?#])/i.test(item.videoUri ?? '');
  // AVFoundation renders the QuickTime rotation correctly, but expo-video's
  // track size (and legacy persisted dimensions) can still be the pre-rotation
  // 16:9 encoded size. That mismatch produces a small 9:16 picture centered in
  // a wide black box, so invert the QuickTime track ratio for feed layout.
  const quickTimeTrackNeedsRotation = Boolean(
    isQuickTimeMov
    && runtimeVideoAspect
    && runtimeVideoAspect > 1
  );
  const videoAspect = quickTimeTrackNeedsRotation
    ? 1 / runtimeVideoAspect!
    : runtimeOrientationConflicts
      ? storedVideoAspect!
      : runtimeVideoAspect ?? storedVideoAspect ?? 9 / 16;
  const naturalVideoHeight = cardWidth / videoAspect;
  // Normal portrait video (including 9:16) keeps its complete native ratio.
  // Only unusually tall media is preview-capped to avoid one post consuming
  // several screens; tapping/pinch zoom still exposes the original content.
  // Keep enough of the following post visible to encourage continuous feed
  // discovery, matching Facebook's compact portrait-video preview.
  const facebookVideoMaxHeight = Math.min(facebookMediaMaxHeight, Math.round(cardWidth * 1.18));
  const feedVideoHeight = Math.round(facebookFeed
    ? clamp(naturalVideoHeight, cardWidth * 0.56, facebookVideoMaxHeight)
    : videoAspect < 0.35
      ? Math.min(naturalVideoHeight, windowHeight * 0.92)
      : naturalVideoHeight);
  const videoPoster = videoAsset?.thumbnailUrl;
  const canExpandCaption = visibleCaption.length > 180 || visibleCaption.split('\n').length > 5;

  useEffect(() => {
    if (!videoPlayer) {
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const timeSubscription = videoPlayer.addListener('timeUpdate', ({ currentTime: nextTime }) => {
      const nextDuration = videoPlayer.duration;
      if (!isScrubbingRef.current) setCurrentTime(nextTime);
      if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
    });
    const sourceSubscription = videoPlayer.addListener('sourceLoad', ({ duration: nextDuration }) => {
      if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
    });

    return () => {
      timeSubscription.remove();
      sourceSubscription.remove();
    };
  }, [videoPlayer]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsManuallyPaused(false);
    isScrubbingRef.current = false;
  }, [item.id]);

  useEffect(() => {
    if (!active) setIsManuallyPaused(false);
  }, [active]);

  const openVideo = useCallback(() => {
    const push = (origin?: { x: number; y: number; width: number; height: number }) => {
      router.push({
        pathname: '/video-feed',
        params: {
          feedId: item.id,
          startTime: String(currentTime),
          ...(origin
            ? { ox: String(origin.x), oy: String(origin.y), ow: String(origin.width), oh: String(origin.height) }
            : {}),
        },
      });
    };
    const ref = videoBoxRef.current;
    if (!ref) return push();
    // วัดตำแหน่งวิดีโอในฟีด — ให้หน้าคลิปขยายจากจุดนี้ (hero แบบ Facebook)
    ref.measureInWindow((x, y, w, h) => {
      if (!w || !h) return push();
      push({ x, y, width: w, height: h });
    });
  }, [currentTime, item.id]);

  const videoTapGesture = useMemo(() => Gesture.Tap()
    .maxDuration(250)
    .onEnd((_event, success) => {
      if (success) runOnJS(openVideo)();
    }), [openVideo]);

  const handleScrub = useCallback((ratio: number) => {
    const player = playerRef.current;
    if (!player || player.duration <= 0) return;
    const nextTime = ratio * player.duration;
    player.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const handleScrubStart = useCallback(() => {
    const player = playerRef.current;
    isScrubbingRef.current = true;
    wasPlayingBeforeScrubRef.current = Boolean(player?.playing);
    if (player?.playing) player.pause();
  }, []);

  const handleScrubEnd = useCallback(() => {
    isScrubbingRef.current = false;
    const player = playerRef.current;
    if (player && wasPlayingBeforeScrubRef.current) {
      player.play();
      setIsManuallyPaused(false);
    }
  }, []);

  const openImage = useCallback((index: number, frame?: { x: number; y: number; width: number; height: number }) => openFeedMediaViewer(
    gallery,
    index,
    imageMedia.map((media) => media.id),
    item.overlays,
    imageMedia,
    { attachedBackdrop: true, originFrame: frame },
  ), [gallery, imageMedia, item.overlays]);

  return (
    <View style={[styles.card, facebookFeed && styles.facebookCard]}>
      <View style={styles.authorRow}>
        <View style={styles.authorButton}>
          <Pressable onPress={onAuthor} accessibilityRole="button" accessibilityLabel={`ดูโปรไฟล์ ${item.author}`}>
            <Avatar
              initial={item.author.slice(0, 1)}
              size={42}
              radius={21}
              backgroundColor={item.gradient[1]}
              uri={item.isUserPost ? ownAvatarUri : item.authorAvatarUri}
            />
          </Pressable>
          <View style={styles.authorText}>
            <Pressable
              onPress={onAuthor}
              style={styles.authorNameButton}
              accessibilityRole="button"
              accessibilityLabel={`ดูโปรไฟล์ ${item.author}`}
            >
              <Text style={styles.authorName} numberOfLines={1}>{item.author}</Text>
            </Pressable>
            <Text
              style={[styles.meta, item.publishStatus === 'failed' && styles.metaFailed]}
              numberOfLines={1}
            >
              {dateLabel}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onMenu}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="ตัวเลือกโพสต์"
          style={styles.menuButton}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#66736D" />
        </Pressable>
      </View>

      {channel === 'jobs' ? (
        <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>หางาน / รับงาน</Text></View>
      ) : channel === 'secondhand' ? (
        <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>สินค้ามือสอง</Text></View>
      ) : null}

      {visibleCaption ? <View style={styles.captionBlock}>
        <Text style={styles.caption} numberOfLines={captionExpanded ? undefined : 5}>{visibleCaption}</Text>
        {canExpandCaption ? (
          <Pressable hitSlop={6} onPress={() => setCaptionExpanded((expanded) => !expanded)}>
            <Text style={styles.moreText}>{captionExpanded ? 'ย่อข้อความ' : 'ดูเพิ่มเติม'}</Text>
          </Pressable>
        ) : null}
      </View> : null}

      {item.products?.length ? (
        <View style={styles.productBlock}>
          <PostProductBar products={item.products} itemId={item.id} rootId={item.rootPostId} />
        </View>
      ) : null}

      {item.videoUri ? (
        <View ref={videoBoxRef} style={[styles.media, { height: feedVideoHeight }]}>
          <FeedPinchZoomLayer resetKey={item.id} enabled={videoReady} contentGesture={videoTapGesture}>
            <FeedVideoLayer
              uri={item.videoUri}
              isActive={active}
              isManuallyPaused={isManuallyPaused}
              contentFit={facebookFeed ? 'cover' : 'contain'}
              onPlayerReady={(player) => {
                playerRef.current = player;
                setVideoPlayer(player);
              }}
              onVideoSize={(width, height) => {
                setVideoSize((current) => current?.width === width && current.height === height ? current : { width, height });
                setVideoReady(true);
              }}
              style={StyleSheet.absoluteFill}
            />
          </FeedPinchZoomLayer>
          {!videoReady ? (
            videoPoster
              ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Image source={{ uri: videoPoster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                </View>
              )
              : <View pointerEvents="none" style={styles.videoPoster} />
          ) : null}
          <View style={styles.videoBadge} pointerEvents="none">
            <Ionicons name="play" size={13} color="#fff" />
            <Text style={styles.videoBadgeText}>วิดีโอ</Text>
          </View>
          <FeedSeekBar
            progress={duration > 0 ? currentTime / duration : 0}
            currentTime={currentTime}
            duration={duration}
            onScrub={handleScrub}
            onSeek={handleScrub}
            onScrubStart={handleScrubStart}
            onScrubEnd={handleScrubEnd}
          />
        </View>
      ) : gallery.length === 1 ? (
        <Pressable
          ref={singleImageRef}
          style={[styles.media, { height: singleImageHeight }]}
          onPress={() => {
            const ref = singleImageRef.current;
            if (!ref) return openImage(0);
            ref.measureInWindow((x, y, w, h) => {
              if (!w || !h) return openImage(0);
              openImage(0, { x, y, width: w, height: h });
            });
          }}
        >
          <Image
            source={{ uri: gallery[0] }}
            style={StyleSheet.absoluteFill}
            resizeMode={facebookFeed ? 'cover' : 'contain'}
            onLoad={({ nativeEvent }) => {
              const source = nativeEvent.source;
              if (source.width > 0 && source.height > 0) {
                setLoadedImageSize((current) => current?.width === source.width && current.height === source.height
                  ? current
                  : { width: source.width, height: source.height });
              }
            }}
          />
        </Pressable>
      ) : gallery.length > 1 ? (
        <View style={styles.media}>
          <MultiImageGrid
            uris={gallery}
            width={cardWidth}
            height={gridHeight}
            onPress={openImage}
            mediaIds={imageMedia.map((media) => media.id)}
            overlays={item.overlays}
            media={imageMedia}
            twoImageLayout={twoLandscapeImages ? 'stacked' : 'side-by-side'}
          />
        </View>
      ) : null}

      {item.product?.name && (item.product.basePrice > 0 || channel === 'secondhand') ? (
        <Pressable style={styles.productRow} onPress={onProduct} disabled={!onProduct}>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName} numberOfLines={1}>{item.product.name}</Text>
            <Text style={styles.productMeta} numberOfLines={1}>
              {item.product.tags.join(' · ') || item.product.shopName}
            </Text>
          </View>
          <Text style={styles.price}>฿{item.product.basePrice.toLocaleString('th-TH')}</Text>
          {onProduct ? <Ionicons name="chevron-forward" size={17} color="#9BA6A0" /> : null}
        </Pressable>
      ) : null}

      {onChat ? (
        <Pressable style={styles.chatButton} onPress={onChat}>
          <Ionicons name="chatbubble-ellipses-outline" size={17} color="#07140F" />
          <Text style={styles.chatButtonText}>{channel === 'jobs' ? 'ติดต่อ / สมัคร' : 'แชตกับผู้ขาย'}</Text>
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <Action icon={item.liked ? 'heart' : 'heart-outline'} label={compactNumber(item.likes)} active={item.liked} onPress={onLike} />
        <Action icon="chatbubble-outline" label={compactNumber(item.comments)} onPress={onComment} />
        <Action icon="arrow-redo-outline" label={compactNumber(item.shares)} onPress={onShare} />
        <View style={{ flex: 1 }} />
        <Action icon={item.saved ? 'bookmark' : 'bookmark-outline'} label="" active={item.saved} onPress={onSave} />
      </View>
    </View>
  );
});

function Action({ icon, label, active, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.action} onPress={onPress} hitSlop={6}>
      <Ionicons name={icon} size={22} color={active ? '#E93455' : '#34413B'} />
      {label ? <Text style={styles.actionText}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 8, backgroundColor: '#F4F5F3', overflow: 'hidden' },
  facebookCard: { marginBottom: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#D8DCDA' },
  authorRow: { minHeight: 60, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authorButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 12 },
  menuButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  authorText: { flex: 1 },
  authorNameButton: { alignSelf: 'flex-start', maxWidth: '100%' },
  authorName: { color: '#168BFF', fontSize: 15, fontWeight: '900' },
  meta: { color: '#707A75', fontSize: 12, marginTop: 2 },
  metaFailed: { color: '#C62828', fontWeight: '800' },
  captionBlock: { paddingHorizontal: 12, paddingBottom: 10 },
  productBlock: { paddingHorizontal: 12, paddingBottom: 10 },
  caption: { color: '#202824', fontSize: 15, lineHeight: 21 },
  moreText: { color: '#65716B', fontSize: 13, fontWeight: '700', marginTop: 3 },
  typeBadge: { alignSelf: 'flex-start', marginLeft: 14, marginBottom: 8, backgroundColor: '#DDF3EA', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  typeBadgeText: { color: '#087A55', fontSize: 11, fontWeight: '800' },
  media: { width: '100%', backgroundColor: '#050706', overflow: 'hidden' },
  videoPoster: { ...StyleSheet.absoluteFill, backgroundColor: '#090D0B', alignItems: 'center', justifyContent: 'center' },
  playbackIcon: { position: 'absolute', left: '50%', top: '50%', width: 66, height: 66, marginLeft: -33, marginTop: -33, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.58)' },
  videoBadge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  videoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  productRow: { minHeight: 66, margin: 12, marginBottom: 2, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#E7EAE7', flexDirection: 'row', alignItems: 'center', gap: 10 },
  productName: { color: '#202824', fontSize: 13, fontWeight: '900' },
  productMeta: { color: '#707A75', fontSize: 11, marginTop: 2 },
  price: { color: '#07835B', fontSize: 15, fontWeight: '900' },
  chatButton: { height: 42, marginHorizontal: 12, marginTop: 10, borderRadius: 11, backgroundColor: '#38DDA4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  chatButtonText: { color: '#07140F', fontWeight: '900', fontSize: 13 },
  actions: { height: 54, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 18 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: '#34413B', fontSize: 12, fontWeight: '700' },
});
