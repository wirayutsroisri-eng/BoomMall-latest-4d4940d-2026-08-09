import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  presign: vi.fn(),
  head: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    mediaAsset: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      update: mocks.update,
      updateMany: mocks.updateMany,
      findMany: mocks.findMany,
    },
  },
}));

vi.mock('../chat/services/upload.service', () => ({
  UploadService: {
    generateMediaAssetUploadUrl: mocks.presign,
    assertObjectUploaded: mocks.head,
  },
}));

import { confirmMediaAsset, createMediaAssetUploadSession } from './MediaAssetService';

function row(status: 'UPLOADING' | 'READY' | 'FAILED' = 'UPLOADING') {
  return {
    id: 'asset-1', ownerId: 'user-1', type: 'IMAGE' as const, status,
    storageKey: 'feed-media/user-1/asset-1/original.jpg',
    canonicalUrl: 'https://cdn.example.com/original.jpg',
    thumbnailUrl: null, playbackUrl: null, width: 1200, height: 1600,
    durationMs: null, mimeType: 'image/jpeg', fileSize: BigInt(100),
    createdAt: new Date('2026-08-21T00:00:00.000Z'),
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
  };
}

describe('MediaAsset lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an uploading asset and confirms it ready after object storage succeeds', async () => {
    mocks.presign.mockResolvedValue({
      uploadUrl: 'https://storage.example.com/signed',
      publicUrl: 'https://cdn.example.com/original.jpg',
      fileKey: 'feed-media/user-1/asset-1/original.jpg',
      mimeType: 'image/jpeg', headers: { 'Content-Type': 'image/jpeg' },
    });
    mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row(), ...data, id: 'asset-1' }));
    mocks.findUnique.mockResolvedValue(row());
    mocks.head.mockResolvedValue({ contentLength: 200, contentType: 'image/jpeg' });
    mocks.update.mockResolvedValue({ ...row('READY'), fileSize: BigInt(200) });

    const session = await createMediaAssetUploadSession('user-1', {
      type: 'image', filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 100,
    });
    expect(session.asset.status).toBe('uploading');
    expect(session.upload.uploadUrl).toContain('signed');

    const ready = await confirmMediaAsset('user-1', 'asset-1');
    expect(ready.status).toBe('ready');
    expect(ready.fileSize).toBe(200);
  });

  it('marks the asset failed and rejects confirmation when the object is absent', async () => {
    mocks.findUnique.mockResolvedValue(row());
    mocks.head.mockRejectedValue(new Error('not found'));
    mocks.update.mockResolvedValue(row('FAILED'));
    await expect(confirmMediaAsset('user-1', 'asset-1')).rejects.toThrow(/could not be confirmed/i);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'FAILED' } }));
  });
});
