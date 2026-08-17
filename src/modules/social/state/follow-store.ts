import { create } from 'zustand';
import { SEED_FOLLOWING_HANDLES } from '@/modules/feed/data/seedFollows';
import { apiFollow, apiListFollowing, apiUnfollow } from '@/modules/social/data/socialApi';

function normalizeHandle(handle: string) {
  return handle.replace(/^@/, '').trim().toLowerCase();
}

function seedFollowing(): Record<string, true> {
  const out: Record<string, true> = {};
  for (const h of SEED_FOLLOWING_HANDLES) out[h] = true;
  return out;
}

type FollowState = {
  /** handles ที่ผู้ใช้กำลังติดตาม (ไม่มี @) */
  following: Record<string, true>;
  isFollowing: (handle: string) => boolean;
  follow: (handle: string) => void;
  unfollow: (handle: string) => void;
  /** TikTok: แตะ + ในฟีด = follow ทันที; คืน true ถ้าเพิ่ง follow */
  followIfNeeded: (handle: string) => boolean;
  hydrateFromServer: () => Promise<void>;
};

/**
 * Shared follow graph — ฟีด + โปรไฟล์ใช้สถานะเดียวกัน
 */
export const useFollowStore = create<FollowState>((set, get) => ({
  following: seedFollowing(),
  isFollowing: (handle) => Boolean(get().following[normalizeHandle(handle)]),
  follow: (handle) => {
    const key = normalizeHandle(handle);
    if (!key) return;
    set((s) =>
      s.following[key] ? s : { following: { ...s.following, [key]: true } },
    );
    void apiFollow(key);
  },
  unfollow: (handle) => {
    const key = normalizeHandle(handle);
    if (!key) return;
    set((s) => {
      if (!s.following[key]) return s;
      const next = { ...s.following };
      delete next[key];
      return { following: next };
    });
    void apiUnfollow(key);
  },
  followIfNeeded: (handle) => {
    const key = normalizeHandle(handle);
    if (!key || get().following[key]) return false;
    get().follow(key);
    return true;
  },
  hydrateFromServer: async () => {
    const handles = await apiListFollowing();
    if (!handles.length) return;
    set((s) => {
      const following = { ...s.following };
      for (const h of handles) following[normalizeHandle(h)] = true;
      return { following };
    });
  },
}));
