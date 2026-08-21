import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import {
  assertPublishMediaContract,
  buildCanonicalPostMedia,
  collectMediaSources,
  isForbiddenPersistentMediaSource,
  type PublishedMediaAsset,
} from './mediaAssetContract';

const image: PublishedMediaAsset = {
  id: 'asset-image', ownerId: 'user-1', type: 'image', status: 'ready',
  storageKey: 'feed-media/user-1/asset-image/original.jpg',
  canonicalUrl: 'https://cdn.example.com/feed/image.jpg',
  thumbnailUrl: 'https://cdn.example.com/feed/image-thumb.jpg',
  width: 1200, height: 1600, mimeType: 'image/jpeg',
};

const video: PublishedMediaAsset = {
  id: 'asset-video', ownerId: 'user-1', type: 'video', status: 'ready',
  storageKey: 'feed-media/user-1/asset-video/original.mp4',
  canonicalUrl: 'https://cdn.example.com/feed/video-original.mp4',
  playbackUrl: 'https://cdn.example.com/feed/video.mp4', mimeType: 'video/mp4',
};

describe('MediaAsset publish contract', () => {
  it.each([
    'file:///var/mobile/Containers/Data/media.jpg',
    '/private/var/mobile/tmp/video.mov',
    'content://device/media/1',
    'ph://ABC',
    '/Users/test/Library/Developer/CoreSimulator/Devices/id/media.jpg',
  ])('rejects non-portable source %s', (source) => {
    expect(isForbiddenPersistentMediaSource(source)).toBe(true);
    expect(() => assertPublishMediaContract({ images: [source], mediaAssetIds: ['asset'] }, { requireAssets: true }))
      .toThrowError(AppError);
  });

  it('does not allow a remote URL to bypass MediaAsset on a new post', () => {
    expect(() => assertPublishMediaContract({ images: ['https://legacy.example/image.jpg'] }, { requireAssets: true }))
      .toThrowError(/ready MediaAsset/i);
  });

  it('emits canonical sources and keeps overlays bound to asset ids', () => {
    const input = {
      mediaAssetIds: [image.id, video.id],
      overlays: [
        { id: 'text-image', mediaId: image.id, type: 'text', text: 'image' },
        { id: 'wrong-local-id', mediaId: 'draft-media-id', type: 'text', text: 'drop' },
      ],
    };
    expect(assertPublishMediaContract(input, { requireAssets: true })).toEqual([image.id, video.id]);
    const media = buildCanonicalPostMedia(input, [image, video]);
    expect(media.images).toEqual([image.canonicalUrl]);
    expect(media.video).toBe(video.playbackUrl);
    expect(media.editorMedia).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: image.id, mediaAssetId: image.id, uri: image.canonicalUrl }),
      expect.objectContaining({ id: video.id, mediaAssetId: video.id, uri: video.playbackUrl }),
    ]));
    expect(media.overlays).toHaveLength(1);
  });

  it('inspects legacy nested media without mutating its metadata', () => {
    const legacy = { editorMedia: [{ id: 'old', uri: 'file:///old.jpg', type: 'image' }] };
    expect(collectMediaSources(legacy)).toContain('file:///old.jpg');
    expect(legacy.editorMedia[0].id).toBe('old');
  });
});
