import React, { memo, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useIsFocused } from 'expo-router';
import { groupStories, type StoryGroup, type Story } from '@/modules/story/domain/types';

import { Avatar } from '@/shared/components/Avatar';

type Props = {
  stories: Story[];
  currentUserId?: string;
  avatarUri?: string | null;
  displayName?: string;
  onOpenStory: (storyId: string) => void;
  onCreateStory: () => void;
};

function latestStory(group: StoryGroup) {
  return group.stories[group.stories.length - 1]!;
}

function VideoPreview({ uri, posterUrl, active, viewed }: { uri: string; posterUrl?: string; active: boolean; viewed: boolean }) {
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
    <View style={[styles.video, viewed ? styles.viewedFrame : styles.unviewedFrame]}>
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

export const FeedStatusRail = memo(function FeedStatusRail({ stories, currentUserId, avatarUri, displayName, onOpenStory, onCreateStory }: Props) {
  const isFocused = useIsFocused();
  const groups = useMemo(() => groupStories(stories), [stories]);
  const ownGroup = useMemo(
    () => (currentUserId ? groups.find((group) => group.userId === currentUserId) : undefined),
    [currentUserId, groups],
  );
  const ownId = ownGroup?.userId;
  const otherGroups = useMemo(() => groups.filter((group) => group.userId !== ownId), [groups, ownId]);

  const renderStoryCard = (group: StoryGroup) => {
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
          ? <VideoPreview uri={story.mediaUrl} posterUrl={story.thumbnailUrl} active={isFocused} viewed={group.viewed} />
          : <Image source={{ uri: story.mediaUrl }} style={[styles.preview, group.viewed ? styles.viewedFrame : styles.unviewedFrame]} resizeMode="cover" />}
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.section}>
      <FlatList
        horizontal
        data={otherGroups}
        keyExtractor={(group) => group.userId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <View style={styles.headerRow}>
            <Pressable
              style={styles.story}
              onPress={onCreateStory}
              accessibilityRole="button"
              accessibilityLabel="สร้าง Story"
            >
              <View style={styles.createAvatarWrap}>
                <Avatar uri={avatarUri} initial={displayName?.charAt(0) || '?'} size={112} radius={15} borderWidth={0} textStyle={styles.createAvatarText} />
                <View style={styles.createButton}>
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.name} numberOfLines={1}>สร้าง Story</Text>
            </Pressable>
            {ownGroup ? renderStoryCard(ownGroup) : null}
          </View>
        )}
        renderItem={({ item: group }) => renderStoryCard(group)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { paddingVertical: 5, backgroundColor: '#FFFFFF', borderBottomWidth: 2, borderBottomColor: '#CCD2CF' },
  content: { paddingHorizontal: 6, gap: 7 },
  headerRow: { flexDirection: 'row', gap: 7 },
  story: { width: 118, gap: 4 },
  preview: { width: 118, height: 176, borderRadius: 15, backgroundColor: '#151B18' },
  video: { width: 118, height: 176, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151B18' },
  unviewedFrame: { borderWidth: 3, borderColor: '#168BFF' },
  viewedFrame: { borderWidth: 2, borderColor: '#9AA49F' },
  poster: { position: 'absolute', top: 0, left: 0 },
  muted: { position: 'absolute', right: 6, bottom: 6, padding: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.48)' },
  createAvatarWrap: { width: 118, height: 176, borderRadius: 15, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 10, backgroundColor: '#EEF2EF', borderWidth: 2, borderColor: '#C3CCC7', position: 'relative' },
  createAvatarText: { color: '#0B65D8' },
  createButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#168BFF', borderWidth: 3, borderColor: '#FFFFFF', position: 'absolute', right: 10, top: 124 },
  name: { color: '#17201C', fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
