import { afterEach, describe, expect, it, vi } from 'vitest';

const getSignedUrl = vi.hoisted(() => vi.fn(async () => 'https://signed.example/upload'));

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl }));

const storageVariables = [
  'AWS_REGION',
  'AWS_S3_BUCKET',
  'S3_BUCKET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
  'CDN_BASE_URL',
] as const;

const originalEnvironment = Object.fromEntries(
  storageVariables.map((name) => [name, process.env[name]]),
) as Record<(typeof storageVariables)[number], string | undefined>;

async function loadStorageModule(environment: Partial<Record<(typeof storageVariables)[number], string>>) {
  vi.resetModules();
  for (const name of storageVariables) delete process.env[name];
  Object.assign(process.env, environment);
  return import('../chat/services/upload.service');
}

afterEach(() => {
  getSignedUrl.mockClear();
  for (const name of storageVariables) {
    const value = originalEnvironment[name];
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('S3-compatible media storage readiness', () => {
  it('detects a complete Cloudflare R2 configuration without exposing secrets', async () => {
    const storage = await loadStorageModule({
      AWS_S3_BUCKET: 'boommall-media',
      AWS_ACCESS_KEY_ID: 'test-access-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
      CDN_BASE_URL: 'https://media.example.com/',
    });

    const readiness = storage.objectStorageReadiness();
    expect(readiness).toMatchObject({
      configured: true,
      provider: 'cloudflare-r2',
      bucket: 'boommall-media',
      region: 'auto',
      endpointConfigured: true,
      publicBaseConfigured: true,
      missing: [],
    });
    expect(JSON.stringify(readiness)).not.toContain('test-access-key');
    expect(JSON.stringify(readiness)).not.toContain('test-secret-key');
  });

  it('requires a public delivery base for R2 media assets', async () => {
    const storage = await loadStorageModule({
      AWS_S3_BUCKET: 'boommall-media',
      AWS_ACCESS_KEY_ID: 'test-access-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    });

    expect(storage.objectStorageReadiness()).toMatchObject({
      configured: false,
      provider: 'cloudflare-r2',
      missing: ['CDN_BASE_URL'],
    });
    expect(() => storage.assertMediaAssetStorageReady()).toThrow(/CDN_BASE_URL/i);
  });

  it('generates a backend-owned R2 key and a size-bound PUT request', async () => {
    const storage = await loadStorageModule({
      AWS_REGION: 'auto',
      AWS_S3_BUCKET: 'boommall-media',
      AWS_ACCESS_KEY_ID: 'test-access-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
      CDN_BASE_URL: 'https://media.example.com',
    });

    const signed = await storage.UploadService.generateMediaAssetUploadUrl(
      '../owner/one',
      'backend-asset-id',
      '../../photo.jpg',
      'image/jpeg',
      1234,
    );

    expect(signed).toMatchObject({
      uploadUrl: 'https://signed.example/upload',
      publicUrl: 'https://media.example.com/media/ownerone/backend-asset-id/original.jpg',
      fileKey: 'media/ownerone/backend-asset-id/original.jpg',
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '1234' },
      expiresIn: 900,
    });
    expect(signed.originalFilename).toBe('....photo.jpg');
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });

  it('supports AWS credential-provider configuration without explicit static keys', async () => {
    const storage = await loadStorageModule({
      AWS_REGION: 'ap-southeast-1',
      AWS_S3_BUCKET: 'boommall-media',
    });

    expect(storage.objectStorageReadiness()).toMatchObject({
      configured: true,
      provider: 'aws-s3',
      endpointConfigured: false,
      region: 'ap-southeast-1',
    });
  });
});
