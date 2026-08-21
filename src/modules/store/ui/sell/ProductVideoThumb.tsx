import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import {
  cacheVideoForPlayback,
  normalizeMediaUri,
} from '@/shared/media/resolveMediaLibraryUri';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
  nativeControls?: boolean;
  muted?: boolean;
  contentFit?: 'contain' | 'cover';
  interactive?: boolean;
  /** Poster frame (from expo-video-thumbnails). Rendered instantly so the
   *  tile never flashes gray/black while the player is loading. */
  poster?: string | null;
  /** Called once the player reports the video's real pixel dimensions (no scale). */
  onVideoSize?: (width: number, height: number) => void;
};

export function ProductVideoThumb({
  uri,
  style,
  autoPlay = false,
  nativeControls = false,
  muted = true,
  contentFit = 'cover',
  interactive = true,
  poster,
  onVideoSize,
}: Props) {
  const [playableUri, setPlayableUri] = useState<string>(normalizeMediaUri(uri));

  // PHPicker/Photo-Library paths can't be opened directly — copy into cache first.
  useEffect(() => {
    let cancelled = false;
    const normalized = normalizeMediaUri(uri);
    cacheVideoForPlayback(normalized).then((cached) => {
      if (!cancelled && cached) setPlayableUri(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const player = useVideoPlayer(playableUri, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    if (!autoPlay && !nativeControls) {
      instance.currentTime = 0.08;
    }
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // รอวิดีโอพร้อมเล่น → อ่านขนาดพิกเซลจริงจาก videoTrack.size
  useEffect(() => {
    if (status !== 'readyToPlay') return;
    const videoTrack = player.videoTrack;
    if (!videoTrack) return;
    const w = videoTrack.size.width;
    const h = videoTrack.size.height;
    if (w > 0 && h > 0) onVideoSize?.(w, h);
  }, [onVideoSize, player, status]);

  useEffect(() => {
    if (autoPlay) {
      player.currentTime = 0;
      player.play();
      return;
    }
    if (!nativeControls) {
      player.currentTime = 0.08;
    }
    player.pause();
  }, [autoPlay, nativeControls, player, playableUri]);

  // Poster stays on top until the video is actually playing (autoplay) or the
  // user taps play (tiles). This guarantees a cover image + play icon is shown
  // instantly with zero gray/black flash.
  const showPoster = Boolean(poster) && (!autoPlay || !isPlaying || status !== 'readyToPlay');

  // While the video is still loading (no poster and not ready yet) show a
  // spinner instead of an empty gray/black tile.
  const videoLoading = !poster && status !== 'readyToPlay' && status !== 'error';

  return (
    <Pressable
      style={[styles.fill, style]}
      disabled={!interactive}
      onPress={() => {
        if (!interactive || nativeControls) return;
        if (player.playing) player.pause();
        else player.play();
      }}
    >
      <VideoView
        player={player}
        style={styles.video}
        contentFit={contentFit}
        nativeControls={nativeControls}
      />
      {showPoster ? (
        <Image source={{ uri: poster ?? undefined }} style={styles.video} resizeMode="cover" />
      ) : null}
      {videoLoading ? (
        <View style={styles.loadingWrap} pointerEvents="none">
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : null}
      {!nativeControls && !isPlaying && !videoLoading ? (
        <View style={styles.playWrap} pointerEvents="none">
          <Ionicons name="play" size={22} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { overflow: 'hidden', flex: 1 },
  video: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  loadingWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  playWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
});
