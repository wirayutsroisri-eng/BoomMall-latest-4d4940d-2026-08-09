import React, { memo, useMemo } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/shared/components/Avatar';
import type { FeedItem } from '@/modules/feed/domain/types';

type Props = {
  items: FeedItem[];
  ownAvatarUri?: string | null;
  ownInitial: string;
  onCreate: () => void;
  onAuthor: (item: FeedItem) => void;
};

function coverUri(item: FeedItem) {
  return item.imageUris?.[0]
    ?? item.imageUri
    ?? item.mediaAssets?.find((asset) => asset.type === 'image')?.canonicalUrl
    ?? item.mediaAssets?.find((asset) => asset.type === 'video')?.thumbnailUrl;
}

export const FeedStatusRail = memo(function FeedStatusRail({
  items,
  ownAvatarUri,
  ownInitial,
  onCreate,
  onAuthor,
}: Props) {
  const statuses = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const ownerKey = item.authorId || item.authorHandle;
      if (!ownerKey || seen.has(ownerKey) || item.isUserPost) return false;
      seen.add(ownerKey);
      return true;
    }).slice(0, 12);
  }, [items]);

  return (
    <View style={styles.section}>
      <FlatList
        horizontal
        data={statuses}
        keyExtractor={(item) => `status:${item.authorId || item.authorHandle}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <Pressable style={styles.createCard} onPress={onCreate} accessibilityRole="button" accessibilityLabel="สร้างสเตตัส">
            <View style={styles.createAvatarArea}>
              <Avatar initial={ownInitial} size={64} uri={ownAvatarUri} backgroundColor="#17201C" />
            </View>
            <View style={styles.createPlus}>
              <Ionicons name="add" size={25} color="#fff" />
            </View>
            <Text style={styles.createTitle}>สร้างสเตตัส</Text>
          </Pressable>
        )}
        renderItem={({ item }) => {
          const cover = coverUri(item);
          return (
            <Pressable
              style={styles.statusCard}
              onPress={() => onAuthor(item)}
              accessibilityRole="button"
              accessibilityLabel={`ดูสเตตัสของ ${item.author}`}
            >
              {cover ? (
                <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: item.gradient[0] }]} />
              )}
              <View style={styles.scrim} />
              <View style={styles.avatarRing}>
                <Avatar
                  initial={item.author.slice(0, 1)}
                  size={48}
                  uri={item.authorAvatarUri}
                  backgroundColor={item.gradient[1]}
                />
              </View>
              {item.videoUri ? (
                <View style={styles.videoMark}>
                  <Ionicons name="play" size={13} color="#fff" />
                </View>
              ) : null}
              <Text style={styles.authorName} numberOfLines={2}>{item.author}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { paddingBottom: 8, backgroundColor: '#070A08' },
  content: { paddingHorizontal: 8, gap: 7 },
  createCard: { width: 106, height: 166, borderRadius: 14, overflow: 'hidden', backgroundColor: '#151B18', borderWidth: StyleSheet.hairlineWidth, borderColor: '#354039' },
  createAvatarArea: { height: 103, alignItems: 'center', justifyContent: 'center', backgroundColor: '#202824' },
  createPlus: { position: 'absolute', top: 82, alignSelf: 'center', width: 36, height: 36, borderRadius: 18, backgroundColor: '#F33A47', borderWidth: 3, borderColor: '#151B18', alignItems: 'center', justifyContent: 'center' },
  createTitle: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 25 },
  statusCard: { width: 106, height: 166, borderRadius: 14, overflow: 'hidden', backgroundColor: '#151B18', borderWidth: StyleSheet.hairlineWidth, borderColor: '#48504C' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.16)', borderBottomColor: 'rgba(0,0,0,0.68)', borderBottomWidth: 52 },
  avatarRing: { position: 'absolute', top: 8, left: 8, width: 54, height: 54, borderRadius: 27, borderWidth: 3, borderColor: '#F33A47', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0E0C' },
  videoMark: { position: 'absolute', top: 13, right: 10, width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.62)' },
  authorName: { position: 'absolute', left: 8, right: 7, bottom: 9, color: '#fff', fontSize: 12, lineHeight: 15, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
});
