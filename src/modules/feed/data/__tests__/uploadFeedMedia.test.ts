import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadMediaAsset } = vi.hoisted(() => ({ uploadMediaAsset: vi.fn() }));

vi.mock('@/modules/media/data/mediaAssetApi', () => ({ uploadMediaAsset }));

import { uploadFeedMedia } from '../uploadFeedMedia';

const remoteAsset = (id: string, url: string, type: 'image' | 'video' = 'image') => ({
  id,
  type,
  status: 'ready' as const,
  storageKey: `feed/${id}`,
  canonicalUrl: url,
});

describe('uploadFeedMedia', () => {
  beforeEach(() => uploadMediaAsset.mockReset());

  it('uploads every local image and resolves with durable remote URLs', async () => {
    uploadMediaAsset
      .mockResolvedValueOnce(remoteAsset('a1', 'https://storage.example/a1.jpg'))
      .mockResolvedValueOnce(remoteAsset('a2', 'https://storage.example/a2.jpg'));

    const result = await uploadFeedMedia({ imageUris: ['file:///one.jpg', 'ph://two'] });

    expect(uploadMediaAsset).toHaveBeenCalledTimes(2);
    expect(result.imageUris).toEqual([
      'https://storage.example/a1.jpg',
      'https://storage.example/a2.jpg',
    ]);
  });

  it('does not upload an existing remote URL again', async () => {
    const result = await uploadFeedMedia({ imageUris: ['https://storage.example/already.jpg'] });

    expect(uploadMediaAsset).not.toHaveBeenCalled();
    expect(result.imageUris).toEqual(['https://storage.example/already.jpg']);
  });

  it('rejects instead of remaining pending when an upload fails', async () => {
    uploadMediaAsset.mockRejectedValueOnce(new Error('MEDIA_OBJECT_UPLOAD_FAILED_503'));

    await expect(uploadFeedMedia({ imageUris: ['assets-library://broken'] }))
      .rejects.toThrow('MEDIA_OBJECT_UPLOAD_FAILED_503');
  });

  it('supports a text-only payload without invoking storage', async () => {
    const result = await uploadFeedMedia({});

    expect(uploadMediaAsset).not.toHaveBeenCalled();
    expect(result).toEqual({ imageUris: [], videoUri: undefined, mediaAssets: [], bindings: [] });
  });
});
