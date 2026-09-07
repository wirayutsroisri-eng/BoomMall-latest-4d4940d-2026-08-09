/* eslint-disable import/first -- vitest mocks must precede the import under test */
import { describe, expect, it, vi } from 'vitest';
import type { MasterSku, SkuVariant, WarehouseStock } from '../domain/types';

vi.mock('@/modules/media/data/mediaAssetApi', () => ({
  uploadMediaAsset: vi.fn(async () => {
    throw new Error('should not be called in this unit test');
  }),
}));

import { prepareBundleForServer } from './uploadProductMedia';

function sampleBundle() {
  const product: MasterSku = {
    id: 'ms-1',
    masterSku: 'BEV-1',
    title: 'สินค้าทดสอบ',
    brand: 'Boom EV',
    shopName: 'ร้านทดสอบ',
    channel: 'B2C',
    basePrice: 100,
    currency: 'THB',
    tags: [],
    customFields: [],
    variantIds: ['sv-1'],
    ownerShopId: 'shop-1',
    imageUri: 'file:///documents/product-images/ms-1-0.jpg',
    imageUris: ['file:///documents/product-images/ms-1-0.jpg'],
    media: [{ uri: 'file:///documents/product-images/ms-1-0.jpg', type: 'image' }],
    specImages: [{ uri: 'https://cdn.boommall.app/spec.jpg', type: 'image' }],
  };
  const variants: SkuVariant[] = [
    {
      id: 'sv-1',
      masterSkuId: 'ms-1',
      sku: 'BEV-1-A',
      label: 'มาตรฐาน',
      imageUri: 'file:///documents/product-images/sv-1.jpg',
      attrs: {},
      price: 100,
      status: 'active',
    },
  ];
  const stock: WarehouseStock[] = [
    { variantId: 'sv-1', warehouseId: 'WH-CTI-MAIN', onHand: 5, reserved: 0, revision: 1 },
  ];
  return { product, variants, stock };
}

describe('prepareBundleForServer (product media persistence)', () => {
  it('uploads local files, keeps remote URLs, dedupes repeated local refs', async () => {
    const calls: { uri: string; type: string }[] = [];
    const uploader = vi.fn(async (uri: string, type: 'image' | 'video') => {
      calls.push({ uri, type });
      return `https://cdn.boommall.app/${type}/${encodeURIComponent(uri)}`;
    });
    const bundle = sampleBundle();
    const out = await prepareBundleForServer(bundle, uploader);

    // media[0] + imageUri + imageUris point at the SAME local file → 1 upload.
    // variant imageUri is a different local file → 1 upload. Total = 2.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.uri).toBe('file:///documents/product-images/ms-1-0.jpg');
    expect(calls[0]!.type).toBe('image');

    expect(out.product.media![0]!.uri).toBe(
      'https://cdn.boommall.app/image/file%3A%2F%2F%2Fdocuments%2Fproduct-images%2Fms-1-0.jpg',
    );
    expect(out.product.imageUri).toBe(out.product.media![0]!.uri);
    expect(out.product.imageUris![0]).toBe(out.product.media![0]!.uri);
    // Remote spec image is never uploaded.
    expect(out.product.specImages![0]!.uri).toBe('https://cdn.boommall.app/spec.jpg');
    expect(out.variants[0]!.imageUri).toBe(
      'https://cdn.boommall.app/image/file%3A%2F%2F%2Fdocuments%2Fproduct-images%2Fsv-1.jpg',
    );
    expect(out.stock).toBe(bundle.stock);
  });

  it('uploads a local video poster as an image while the video stays a video', async () => {
    const calls: { uri: string; type: string }[] = [];
    const uploader = vi.fn(async (uri: string, type: 'image' | 'video') => {
      calls.push({ uri, type });
      return `https://cdn.boommall.app/${type}/${encodeURIComponent(uri)}`;
    });
    const bundle = sampleBundle();
    bundle.product.media = [
      {
        uri: 'file:///documents/product-images/video-1.mp4',
        type: 'video',
        thumbnailUri: 'file:///documents/product-images/video-1.thumb.jpg',
      },
    ];
    bundle.product.imageUri = undefined;
    bundle.product.imageUris = undefined;
    bundle.variants[0]!.imageUri = undefined;
    const out = await prepareBundleForServer(bundle, uploader);

    const videoCall = calls.find((c) => c.uri.includes('.mp4'));
    const thumbCall = calls.find((c) => c.uri.includes('.thumb.jpg'));
    expect(videoCall?.type).toBe('video');
    expect(thumbCall?.type).toBe('image');
    expect(out.product.media![0]!.uri).toContain('video');
    expect(out.product.media![0]!.thumbnailUri).toContain('image');
  });

  it('does not block editing when a legacy local file is missing, but real errors still fail', async () => {
    const uploader = vi.fn(async (uri: string, type: 'image' | 'video') => {
      if (uri.includes('missing.jpg')) throw new Error('MEDIA_LOCAL_FILE_MISSING');
      if (uri.includes('networkfail.jpg')) throw new Error('fetch failed');
      return `https://cdn.boommall.app/${type}/${encodeURIComponent(uri)}`;
    });

    const missingBundle = sampleBundle();
    missingBundle.product.media = [
      { uri: 'file:///documents/product-images/missing.jpg', type: 'image' },
      { uri: 'file:///documents/product-images/ok.jpg', type: 'image' },
    ];
    missingBundle.product.imageUri = 'file:///documents/product-images/missing.jpg';
    missingBundle.product.imageUris = ['file:///documents/product-images/missing.jpg'];
    const out = await prepareBundleForServer(missingBundle, uploader);
    // Dead local reference is kept as-is (seller can still edit price/stock);
    // the existing file uploads normally.
    expect(out.product.media![0]!.uri).toBe('file:///documents/product-images/missing.jpg');
    expect(out.product.media![1]!.uri).toContain('ok.jpg');
    expect(out.product.imageUri).toBe('file:///documents/product-images/missing.jpg');

    const networkBundle = sampleBundle();
    networkBundle.product.media = [
      { uri: 'file:///documents/product-images/networkfail.jpg', type: 'image' },
    ];
    networkBundle.product.imageUri = undefined;
    networkBundle.product.imageUris = undefined;
    await expect(prepareBundleForServer(networkBundle, uploader)).rejects.toThrow('fetch failed');
  });

  it('leaves a fully-remote bundle untouched (no upload churn on re-save)', async () => {
    const uploader = vi.fn(async () => 'https://cdn.boommall.app/x');
    const bundle = sampleBundle();
    bundle.product.imageUri = 'https://cdn.boommall.app/a.jpg';
    bundle.product.imageUris = ['https://cdn.boommall.app/a.jpg'];
    bundle.product.media = [{ uri: 'https://cdn.boommall.app/a.jpg', type: 'image' }];
    bundle.variants[0]!.imageUri = 'https://cdn.boommall.app/b.jpg';
    const out = await prepareBundleForServer(bundle, uploader);
    expect(uploader).not.toHaveBeenCalled();
    expect(out.product.imageUri).toBe('https://cdn.boommall.app/a.jpg');
    expect(out.variants[0]!.imageUri).toBe('https://cdn.boommall.app/b.jpg');
  });
});
