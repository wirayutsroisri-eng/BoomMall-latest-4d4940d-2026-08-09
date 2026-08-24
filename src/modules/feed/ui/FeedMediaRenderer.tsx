import React, { memo, useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { FeedItem } from '@/modules/feed/domain/types';
import { FeedVideoLayer } from './FeedVideoLayer';
import { MultiImageGrid } from './MultiImageGrid';
import type { VideoPlayer } from 'expo-video';
import type { TextOverlayObject } from '@/modules/create/domain/editorComposition';
import { TextOverlayRenderer } from '@/modules/create/ui/TextOverlayRenderer';

type Props = {
  item: FeedItem;
  gallery: string[];
  width: number;
  height: number;
  imageLayout: { width: number; height: number };
  isActive?: boolean;
  isManuallyPaused: boolean;
  onPlayerReady: (player: VideoPlayer) => void;
  onOpenImage: (index: number) => void;
};

export const FeedMediaRenderer = memo(function FeedMediaRenderer({
  item, gallery, width, height, imageLayout, isActive, isManuallyPaused, onPlayerReady, onOpenImage,
}: Props) {
  const renderedRemoteUri = item.videoUri ?? gallery[0];
  useEffect(() => {
    if (/^https?:\/\//i.test(renderedRemoteUri ?? '')) {
      console.info('[POST_MEDIA] remote image rendered', { postId: item.id, remoteUrl: renderedRemoteUri });
    }
  }, [item.id, renderedRemoteUri]);
  const primaryMediaId = item.editorMedia?.[0]?.id;
  const primaryTextOverlays = item.overlays?.filter(
    (overlay): overlay is TextOverlayObject =>
      overlay.type === 'text' && overlay.mediaId === primaryMediaId,
  ) ?? [];
  if (item.videoUri) {
    return (
      <View style={styles.stage}>
        <FeedVideoLayer uri={item.videoUri} isActive={isActive} isManuallyPaused={isManuallyPaused}
          contentFit="contain" onPlayerReady={onPlayerReady} style={StyleSheet.absoluteFill} />
        <TextOverlayRenderer overlays={primaryTextOverlays} />
      </View>
    );
  }
  if (gallery.length > 1) {
    return <View style={styles.center}><MultiImageGrid
      uris={gallery}
      width={width}
      height={height}
      onPress={onOpenImage}
      mediaIds={item.editorMedia?.map((media) => media.id)}
      media={item.editorMedia}
      overlays={item.overlays}
    /></View>;
  }
  if (gallery[0]) {
    return (
      <Pressable style={styles.stage} onPress={() => onOpenImage(0)} accessibilityRole="imagebutton">
        <View style={imageLayout}>
          <Image source={{ uri: gallery[0] }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          <TextOverlayRenderer overlays={primaryTextOverlays} />
        </View>
      </Pressable>
    );
  }
  if (item.mediaUnavailable) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.mediaUnavailable]}>
        <Text style={styles.mediaUnavailableText}>ไม่สามารถโหลดสื่อของโพสต์นี้ได้</Text>
      </View>
    );
  }
  return (
    <LinearGradient colors={item.gradient} style={[StyleSheet.absoluteFill, styles.textCard]}>
      <Text style={styles.textCardText} numberOfLines={10}>{item.caption}</Text>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  textCard: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, paddingVertical: 80 },
  textCardText: { color: '#fff', fontSize: 26, lineHeight: 35, fontWeight: '800', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 5 },
  mediaUnavailable: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#171717', padding: 24 },
  mediaUnavailableText: { color: '#C9CECB', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
