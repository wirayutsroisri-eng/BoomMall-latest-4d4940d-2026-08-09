import { afterEach, describe, expect, it, vi } from 'vitest';
import { listFriendRequests, searchFriendProfiles, sendFriendRequest } from './friendApi';
vi.mock('@/modules/auth/state/auth-store', () => ({
  getApiBase: () => 'https://api.example.test',
  useAuthStore: { getState: () => ({ sessionToken: 'test-session' }) },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('friend API failure visibility', () => {
  it('sends the selected account ID with authentication', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { id: '1', status: 'PENDING' } }) });
    vi.stubGlobal('fetch', fetcher);
    expect(await sendFriendRequest('bob')).toMatchObject({ status: 'PENDING' });
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/api/v1/friends/requests', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ receiverId: 'bob' }), headers: expect.objectContaining({ Authorization: 'Bearer test-session' }),
    }));
  });
  it('surfaces server errors instead of returning empty search results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: { message: 'เซสชันหมดอายุ' } }) }));
    await expect(searchFriendProfiles('bob')).rejects.toThrow('เซสชันหมดอายุ');
  });
  it('does not report success when the server returns an invalid response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('HTML response'); } }));
    await expect(sendFriendRequest('bob')).rejects.toThrow('เชื่อมต่อระบบเพื่อนไม่สำเร็จ');
  });
  it('times out so receiving devices can retry instead of remaining stuck', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const result = expect(listFriendRequests()).rejects.toThrow('เซิร์ฟเวอร์ไม่ตอบสนอง');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
  });
});
