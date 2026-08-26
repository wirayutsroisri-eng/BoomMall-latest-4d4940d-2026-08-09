import React, { memo, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useIsFocused } from 'expo-router';
import { groupStories, type StoryGroup, type Story } from '@/modules/story/domain/types';

type Props = {
  stories: Story[];
  onOpenStory: (storyId: string) => void;
};

function latestStory(group: StoryGroup) {
  return group.stories[group.stories.length - 1]!;
}

function VideoPreview({ uri, posterUrl, active }: { uri: string; posterUrl?: string; active: boolean }) {
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const player = useVideoPlayer({ uri, useCaching: true }, (instance) => {
    instance.muted = true;
    instance.loop = true;
    if (active) instance.play();
  });

  useEffect(() => {
    try {
      player.muted = true;
      player.loop = true;
      if (active) player.play();
      else player.pause();
    } catch {
      // expo-video may release the native player during Fast Refresh.
    }
  }, [active, player]);

  return (
    <View style={styles.video}>
      <VideoView
        player={player}
        style={styles.preview}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setFirstFrameRendered(true)}
      />
      {posterUrl && !firstFrameRendered
        ? <Image source={{ uri: posterUrl }} style={[styles.preview, styles.poster]} resizeMode="cover" />
        : null}
      <Ionicons name="volume-mute" size={16} color="#fff" style={styles.muted} />
    </View>
  );
}

export const FeedStatusRail = memo(function FeedStatusRail({ stories, onOpenStory }: Props) {
  const isFocused = useIsFocused();
  const groups = useMemo(() => groupStories(stories), [stories]);
  if (!groups.length) return null;

  return (
    <View style={styles.section}>
      <FlatList
        horizontal
        data={groups}
        keyExtractor={(group) => group.userId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        renderItem={({ item: group }) => {
          const story = latestStory(group);
          const name = story.user?.displayName || story.user?.handle || 'ผู้ใช้';
          return (
            <Pressable
              style={styles.story}
              onPress={() => onOpenStory(story.id)}
              accessibilityRole="button"
              accessibilityLabel={`ดู Story ของ ${name}`}
            >
              {story.mediaType === 'video'
                ? <VideoPreview uri={story.mediaUrl} posterUrl={story.thumbnailUrl} active={isFocused} />
                : <Image source={{ uri: story.mediaUrl }} style={styles.preview} resizeMode="cover" />}
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { paddingVertical: 8, backgroundColor: '#E9ECE9' },
  content: { paddingHorizontal: 10, gap: 10 },
  story: { width: 82, gap: 5 },
  preview: { width: 82, height: 116, borderRadius: 10, backgroundColor: '#151B18' },
  video: { width: 82, height: 116, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151B18' },
  poster: { position: 'absolute', top: 0, left: 0 },
  muted: { position: 'absolute', right: 6, bottom: 6, padding: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.48)' },
  name: { color: '#17201C', fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
