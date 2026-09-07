import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadMediaAsset } from './mediaAssetApi';

const mock = vi.hoisted(() => ({ os: 'android', upload: vi.fn(), expoFetch: vi.fn(), exists: true, type: 'image/jpeg' }));
vi.mock('react-native', () => ({ Platform: { get OS() { return mock.os; } } }));
vi.mock('expo/fetch', () => ({ fetch: mock.expoFetch }));
vi.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0 },
  File: class {
    name = 'photo.jpg'; size = 2048;
    get exists() { return mock.exists; }
    get type() { return mock.type; }
    upload = mock.upload;
  },
}));
vi.mock('@/modules/auth/state/auth-store', () => ({ getApiBase: () => 'https://api.example.test', authHeaders: () => ({ Authorization: 'Bearer test-session' }) }));
const headers = { 'Content-Type': 'image/jpeg', 'Content-Length': '2048' };
const asset = { id: 'asset-1', status: 'ready', canonicalUrl: 'https://media.example.test/photo.jpg' };
let api: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mock.os = 'android'; mock.exists = true; mock.type = 'image/jpeg';
  mock.upload.mockResolvedValue({ status: 204 });
  mock.expoFetch.mockResolvedValue({ status: 200, ok: true });
  api = vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ data: { asset, upload: { uploadUrl: 'https://media.example.test/upload', mimeType: 'image/jpeg', headers } } }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: asset }) });
  vi.stubGlobal('fetch', api);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Android media upload', () => {
  it('streams a native binary PUT with signed headers and confirms only after upload', async () => {
    expect(await uploadMediaAsset({ uri: 'file:///photo.jpg', type: 'image' })).toEqual(asset);
    expect(mock.upload).toHaveBeenCalledWith('https://media.example.test/upload', expect.objectContaining({ httpMethod: 'PUT', uploadType: 0, headers, signal: expect.any(AbortSignal) }));
    expect(mock.expoFetch).not.toHaveBeenCalled();
    expect(api.mock.calls[1][0]).toContain('/asset-1/confirm');
    expect(mock.upload.mock.invocationCallOrder[0]).toBeLessThan(api.mock.invocationCallOrder[1]);
  });
  it('does not confirm when storage rejects the upload', async () => {
    mock.upload.mockResolvedValue({ status: 403 });
    await expect(uploadMediaAsset({ uri: 'file:///photo.jpg', type: 'image' })).rejects.toMatchObject({ message: 'MEDIA_OBJECT_UPLOAD_FAILED_403', step: 'object-upload', statusCode: 403 });
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('cancels a stuck native upload and leaves the asset unconfirmed', async () => {
    vi.useFakeTimers();
    mock.upload.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('cancelled'))); }));
    const result = expect(uploadMediaAsset({ uri: 'file:///photo.jpg', type: 'image' })).rejects.toMatchObject({ message: 'MEDIA_OBJECT_UPLOAD_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(120_000);
    await result;
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('falls back to the extension when Android reports a generic MIME type', async () => {
    mock.type = 'application/octet-stream';
    await uploadMediaAsset({ uri: 'file:///photo.jpg', type: 'image' });
    expect(JSON.parse(api.mock.calls[0][1].body).mimeType).toBe('image/jpeg');
  });
  it('rejects missing local photos before requesting an upload session', async () => {
    mock.exists = false;
    await expect(uploadMediaAsset({ uri: 'file:///gone.jpg', type: 'image' })).rejects.toThrow('MEDIA_LOCAL_FILE_MISSING');
    expect(api).not.toHaveBeenCalled();
  });
  it('preserves the existing iOS transport', async () => {
    mock.os = 'ios';
    await uploadMediaAsset({ uri: 'file:///photo.jpg', type: 'image' });
    expect(mock.expoFetch).toHaveBeenCalledOnce();
    expect(mock.upload).not.toHaveBeenCalled();
  });
});
