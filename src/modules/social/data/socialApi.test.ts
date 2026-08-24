import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/modules/auth/state/auth-store', () => ({
  getApiBase: () => 'https://api.boommall.test',
  authHeaders: () => ({ Authorization: 'Bearer session-token' }),
}));

vi.mock('@/shared/api/apiBase', () => ({ apiFetch: mocks.apiFetch }));

import { apiDeleteAccount } from './socialApi';

describe('apiDeleteAccount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the shared authenticated API transport', async () => {
    mocks.apiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(apiDeleteAccount()).resolves.toEqual({ ok: true });
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'https://api.boommall.test/api/v1/auth/me',
      { method: 'DELETE', headers: { Authorization: 'Bearer session-token' } },
    );
  });

  it('surfaces the backend error without clearing the local account', async () => {
    mocks.apiFetch.mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { message: 'unauthorized' },
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(apiDeleteAccount()).rejects.toThrow('unauthorized');
  });
});
