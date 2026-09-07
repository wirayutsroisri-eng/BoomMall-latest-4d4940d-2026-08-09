import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), fetch: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-file-system', () => ({ UploadType: { BINARY_CONTENT: 0 }, File: class { exists = true; size = 512; upload = mocks.upload; } }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));
vi.mock('@/modules/auth/state/auth-store', () => ({ getApiBase: () => 'https://api.test', useAuthStore: { getState: () => ({ sessionToken: 'test' }) } }));
import { uploadChatMediaBytes } from './chatMedia';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); mocks.upload.mockResolvedValue({ status: 200 }); mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { uploadUrl: 'https://storage.test/put', publicUrl: 'https://storage.test/photo.jpg', headers: { 'Content-Type': 'image/jpeg' } } }) }); });
afterEach(() => vi.unstubAllGlobals());
it('streams Android attachments without materializing bytes', async () => {
  expect(await uploadChatMediaBytes('file:///a.jpg', 'image/jpeg', 'a.jpg')).toMatchObject({ url: 'https://storage.test/photo.jpg', size: 512 });
  expect(mocks.upload).toHaveBeenCalledWith('https://storage.test/put', expect.objectContaining({ httpMethod: 'PUT', uploadType: 0, headers: { 'Content-Type': 'image/jpeg' } }));
});
it('reports a storage rejection rather than pretending upload succeeded', async () => {
  mocks.upload.mockResolvedValue({ status: 403 });
  await expect(uploadChatMediaBytes('file:///a.jpg', 'image/jpeg', 'a.jpg')).rejects.toThrow('CHAT_MEDIA_UPLOAD_FAILED_403');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it('uses native API fallback only when presigning is unsupported', async () => {
  mocks.fetch.mockResolvedValue({ status: 501 });
  mocks.upload.mockResolvedValue({ status: 201, body: JSON.stringify({ data: { url: 'https://api.test/uploads/a.jpg' } }) });
  expect(await uploadChatMediaBytes('file:///a.jpg', 'image/jpeg', 'a.jpg')).toMatchObject({ url: 'https://api.test/uploads/a.jpg' });
  expect(mocks.upload).toHaveBeenCalledWith('https://api.test/api/v1/chat-domain/media', expect.objectContaining({ httpMethod: 'POST', uploadType: 0 }));
});
