import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = {
  uri: string;
  isActive?: boolean;
};

/** Full-bleed looping clip on a feed card. Pauses when the reel is off-screen. */
export function FeedVideoLayer({ uri, isActive = false }: Props) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = false;
    instance.currentTime = 0;
  });

  useEffect(() => {
    if (isActive) {
      player.muted = false;
      player.play();
    } else {
      player.pause();
      player.muted = true;
    }
  }, [isActive, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      pointerEvents="none"
      nativeControls={false}
    />
  );
}
