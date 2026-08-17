import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

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
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    instance.currentTime = 0.08;
    if (autoPlay) instance.play();
    else instance.pause();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

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
        style={StyleSheet.absoluteFill}
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
  fill: { overflow: 'hidden' },
  playWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
});
