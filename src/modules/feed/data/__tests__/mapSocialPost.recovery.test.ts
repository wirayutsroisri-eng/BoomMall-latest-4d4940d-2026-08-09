import { describe, expect, it } from 'vitest';

import type { FeedItem } from '@/modules/feed/domain/types';
import {
  mergeFeedItems,
  socialPostToFeedItem,
  type SocialPostDto,
} from '../mapSocialPost';

function post(media: unknown): SocialPostDto {
  return {
    id: 'post-recovery',
    authorId: 'user-1',
    body: 'recovery',
    media,
    status: 'ACTIVE',
    likeCount: 0,
  };
}

describe('feed media recovery adapter', () => {
  it('prefers ready MediaAsset sources when device cache is gone', () => {
    expect(socialPostToFeedItem(post({
      images: ['file:///old-device/image.jpg'],
      video: 'file:///old-device/video.mov',
      mediaAssets: [
        { id: 'image-asset', type: 'image', status: 'ready', canonicalUrl: 'https://cdn.example.com/new.jpg' },
        { id: 'video-asset', type: 'video', status: 'ready', canonicalUrl: 'https://cdn.example.com/original.mp4', playbackUrl: 'https://cdn.example.com/play.mp4' },
      ],
    }))).toMatchObject({
      imageUri: 'https://cdn.example.com/new.jpg',
      videoUri: 'https://cdn.example.com/play.mp4',
    });
  });
  it('keeps portable legacy image and video URLs', () => {
    expect(socialPostToFeedItem(post({
      images: ['https://cdn.example.com/photo.jpg'],
      video: 'https://cdn.example.com/video.mp4',
    }))).toMatchObject({
      imageUri: 'https://cdn.example.com/photo.jpg',
      videoUri: 'https://cdn.example.com/video.mp4',
    });
  });

  it('resolves feed media independently of the native editor feature flag', () => {
    const before = process.env.EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED;
    const input = post({ images: ['https://cdn.example.com/photo.jpg'] });
    process.env.EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED = 'true';
    const enabled = socialPostToFeedItem(input).imageUri;
    process.env.EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED = 'false';
    const disabled = socialPostToFeedItem(input).imageUri;
    process.env.EXPO_PUBLIC_NATIVE_MEDIA_EDITOR_ENABLED = before;
    expect(enabled).toBe(disabled);
  });

  it('reads portable media from the new editorMedia contract when legacy fields are absent', () => {
    expect(socialPostToFeedItem(post({
      editorMedia: [
        { id: 'image-1', type: 'image', uri: 'https://cdn.example.com/photo.jpg' },
        { id: 'video-1', type: 'video', uri: 'https://cdn.example.com/video.mp4' },
      ],
    }))).toMatchObject({
      imageUri: 'https://cdn.example.com/photo.jpg',
      videoUri: 'https://cdn.example.com/video.mp4',
    });
  });

  it('does not send another installation sandbox URI to the feed renderer', () => {
    const mapped = socialPostToFeedItem(post([
      'file:///var/mobile/Containers/Data/Application/OLD/Library/Caches/photo.jpg',
    ]));

    expect(mapped.imageUri).toBeUndefined();
    expect(mapped.imageUris).toBeUndefined();
  });

  it('falls back to the current device cached item when the server source is unusable', () => {
    const remote = socialPostToFeedItem(post([
      'file:///var/mobile/Containers/Data/Application/OLD/Library/Caches/photo.jpg',
    ]));
    const local = {
      ...remote,
      imageUri: 'file:///current-device/Documents/feed/photo.jpg',
      imageUris: ['file:///current-device/Documents/feed/photo.jpg'],
      isUserPost: true,
    } as FeedItem;

    const [recovered] = mergeFeedItems([remote], [local]);

    expect(recovered.imageUri).toBe(local.imageUri);
  });
});
