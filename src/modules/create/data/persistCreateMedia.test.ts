import { beforeEach, expect, it, vi } from 'vitest';
import { persistCreateMedia } from './persistCreateMedia';

const mock = vi.hoisted(() => ({ copy: vi.fn(), manipulate: vi.fn(), uuid: 0 }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `unique-${++mock.uuid}` }));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  Directory: class { uri = 'file:///documents/create-media'; exists = true; },
  File: class {
    uri: string; exists = true;
    constructor(base: string | { uri: string }, name?: string) { this.uri = name ? `${typeof base === 'string' ? base : base.uri}/${name}` : String(base); }
    copy(target: { uri: string }) { mock.copy(target.uri); }
  },
}));
vi.mock('expo-file-system/legacy', () => ({ copyAsync: vi.fn() }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: mock.manipulate }, SaveFormat: { JPEG: 'jpeg' } }));
vi.mock('@/shared/media/resolveMediaLibraryUri', () => ({ normalizeMediaUri: (uri: string) => uri }));
beforeEach(() => {
  vi.clearAllMocks(); mock.uuid = 0;
  mock.manipulate.mockReturnValue({ renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///cache/rendered.jpg' }) }) });
});
it('uses different destination files for simultaneous photo saves', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const [first, second] = await Promise.all([persistCreateMedia('content://photos/1', 'image'), persistCreateMedia('content://photos/2', 'image')]);
    expect(first).not.toBe(second);
    expect(mock.copy).toHaveBeenCalledTimes(2);
  } finally { vi.restoreAllMocks(); }
});
it('reuses a persisted image without decoding and recompressing it again', async () => {
  const uri = 'file:///documents/create-media/photo.jpg';
  expect(await persistCreateMedia(uri, 'image')).toBe(uri);
  expect(mock.manipulate).not.toHaveBeenCalled();
  expect(mock.copy).not.toHaveBeenCalled();
});
it('keeps already uploaded media remote', async () => {
  const uri = 'https://media.example.test/photo.jpg';
  expect(await persistCreateMedia(uri, 'image')).toBe(uri);
  expect(mock.manipulate).not.toHaveBeenCalled();
});
