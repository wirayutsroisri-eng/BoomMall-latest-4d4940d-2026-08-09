import { describe, expect, it } from 'vitest';
import { isRemoteMediaUrl, needsNoMediaUpload } from './product-media';

describe('persistent product media references', () => {
  it('accepts only public http(s) URLs as device-independent', () => {
    expect(isRemoteMediaUrl('https://cdn.boommall.app/media/abc/original.jpg')).toBe(true);
    expect(isRemoteMediaUrl('http://192.168.1.23:4000/uploads/images/a.jpg')).toBe(true);
    expect(isRemoteMediaUrl('file:///var/mobile/.../product-images/ms-1-0.jpg')).toBe(false);
    expect(isRemoteMediaUrl('content://media/external/images/1')).toBe(false);
    expect(isRemoteMediaUrl('ph://ABC/DCBA')).toBe(false);
    expect(isRemoteMediaUrl('data:image/png;base64,xxx')).toBe(false);
    expect(isRemoteMediaUrl('/private/var/.../x.jpg')).toBe(false);
    expect(isRemoteMediaUrl('')).toBe(false);
    expect(isRemoteMediaUrl(undefined)).toBe(false);
    expect(isRemoteMediaUrl(null)).toBe(false);
  });

  it('reports only local refs as needing an upload before persist', () => {
    expect(needsNoMediaUpload('https://cdn.example/a.jpg')).toBe(true);
    expect(needsNoMediaUpload(undefined)).toBe(true);
    expect(needsNoMediaUpload('file:///documents/x.jpg')).toBe(false);
  });
});
