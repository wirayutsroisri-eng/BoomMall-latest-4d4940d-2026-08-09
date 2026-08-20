import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { normalizeMediaUri } from '@/shared/media/resolveMediaLibraryUri';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  autoPlay?: boolean;
  nativeControls?: boolean;
  muted?: boolean;
  contentFit?: 'contain' | 'cover';
  interactive?: boolean;
};

export function ProductVideoThumb({
  uri,
  style,
  autoPlay = false,
  nativeControls = false,
  muted = true,
  contentFit = 'cover',
  interactive = true,
}: Props) {
  const source = normalizeMediaUri(uri);
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    if (!autoPlay && !nativeControls) {
      instance.currentTime = 0.08;
    }
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

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
  }, [autoPlay, nativeControls, player, source]);

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
      {!nativeControls && !isPlaying ? (
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
  playWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
});
