import { afterEach, describe, expect, it } from 'vitest';
import { rebaseCatalogMedia } from './catalogPayloadMedia';

const ORIGINAL_MEDIA_BASE = process.env.MEDIA_PUBLIC_BASE_URL;

afterEach(() => {
  if (ORIGINAL_MEDIA_BASE === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
  else process.env.MEDIA_PUBLIC_BASE_URL = ORIGINAL_MEDIA_BASE;
});

describe('rebaseCatalogMedia (read-path URL hardening)', () => {
  it('re-bases stale /uploads/ dev host onto the current media base', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'http://192.168.1.50:4000';
    const payload = {
      title: 'สินค้า',
      imageUri: 'http://192.168.1.10:4000/uploads/images/a1.jpg',
      imageUris: ['http://192.168.1.10:4000/uploads/images/a1.jpg'],
      media: [
        { uri: 'http://192.168.1.10:4000/uploads/images/a1.jpg', type: 'image' },
        { uri: 'https://cdn.boommall.app/media/u/abc/original.jpg', type: 'image' },
      ],
      specImages: [{ uri: 'http://192.168.1.10:4000/uploads/images/spec.jpg', type: 'image' }],
    };
    const out = rebaseCatalogMedia(payload) as Record<string, any>;
    expect(out.imageUri).toBe('http://192.168.1.50:4000/uploads/images/a1.jpg');
    expect(out.imageUris?.[0]).toBe('http://192.168.1.50:4000/uploads/images/a1.jpg');
    expect(out.media?.[0].uri).toBe('http://192.168.1.50:4000/uploads/images/a1.jpg');
    expect(out.media?.[1].uri).toBe('https://cdn.boommall.app/media/u/abc/original.jpg');
    expect(out.specImages?.[0].uri).toBe('http://192.168.1.50:4000/uploads/images/spec.jpg');
    // Non-media fields must never be rewritten.
    expect(out.title).toBe('สินค้า');
  });

  it('leaves canonical CDN, device file paths, and plain text untouched', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'http://192.168.1.50:4000';
    const payload = {
      title: 'สินค้า',
      imageUri: 'file:///var/mobile/Containers/Data/.../product-images/ms-1-0.jpg',
      media: [
        { uri: 'https://cdn.boommall.app/media/u/abc/original.jpg', type: 'image' },
        { uri: 'file:///documents/x.jpg', type: 'image' },
      ],
      description: 'ลิงก์ http://192.168.1.10:4000/uploads/x.jpg ในข้อความ',
    };
    const out = rebaseCatalogMedia(payload) as Record<string, any>;
    expect(out.imageUri).toBe(payload.imageUri);
    expect(out.media?.[0].uri).toBe('https://cdn.boommall.app/media/u/abc/original.jpg');
    expect(out.media?.[1].uri).toBe('file:///documents/x.jpg');
    expect(out.description).toBe(payload.description);
  });

  it('variant payloads (imageUri per SKU) are rebased the same way', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'http://192.168.1.50:4000';
    const variant = { sku: 'BEV-1', imageUri: 'http://192.168.1.10:4000/uploads/images/v1.jpg' };
    const out = rebaseCatalogMedia(variant) as Record<string, any>;
    expect(out.imageUri).toBe('http://192.168.1.50:4000/uploads/images/v1.jpg');
  });

  it('does not mutate the original payload object', () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'http://192.168.1.50:4000';
    const payload = {
      media: [{ uri: 'http://192.168.1.10:4000/uploads/images/a1.jpg', type: 'image' }],
    };
    rebaseCatalogMedia(payload);
    expect((payload.media as any)[0].uri).toBe('http://192.168.1.10:4000/uploads/images/a1.jpg');
  });
});
