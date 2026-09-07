import { create } from 'zustand';
import {
  apiFollow,
  apiListFollowing,
  apiUnfriend,
  apiUnfollow,
  type RelationshipState,
} from '@/modules/social/data/socialApi';

function normalizeHandle(handle: string) {
  return handle.replace(/^@/, '').trim().toLowerCase();
}

type FollowState = {
  /** handles ที่ผู้ใช้กำลังติดตาม (ไม่มี @) */
  following: Record<string, true>;
  /** Relationship state shared by profile, feed, search and chat entry points. */
  relationshipByUserId: Record<string, RelationshipState>;
  relationshipByHandle: Record<string, RelationshipState>;
  isFollowing: (handle: string) => boolean;
  setRelationship: (input: { userId: string; handle?: string | null; relationship: RelationshipState }) => void;
  follow: (handle: string) => void;
  unfollow: (handle: string) => void;
  followNow: (handle: string) => Promise<void>;
  unfollowNow: (handle: string) => Promise<void>;
  unfriendNow: (userId: string, handle?: string | null) => Promise<void>;
  /** TikTok: แตะ + ในฟีด = follow ทันที; คืน true ถ้าเพิ่ง follow */
  followIfNeeded: (handle: string) => boolean;
  hydrateFromServer: () => Promise<void>;
  reset: () => void;
};

/**
 * Shared follow graph — ฟีด + โปรไฟล์ใช้สถานะเดียวกัน
 */
export const useFollowStore = create<FollowState>((set, get) => ({
  following: {},
  relationshipByUserId: {},
  relationshipByHandle: {},
  isFollowing: (handle) => Boolean(get().following[normalizeHandle(handle)]),
  setRelationship: ({ userId, handle, relationship }) => {
    const key = normalizeHandle(handle ?? '');
    set((state) => {
      const following = { ...state.following };
      if (key) {
        if (relationship.isFollowing) following[key] = true;
        else delete following[key];
      }
      return {
        relationshipByUserId: { ...state.relationshipByUserId, [userId]: relationship },
        relationshipByHandle: key
          ? { ...state.relationshipByHandle, [key]: relationship }
          : state.relationshipByHandle,
        following,
      };
    });
  },
  followNow: async (handle) => {
    const key = normalizeHandle(handle);
    if (!key) return;
    const before = get().relationshipByHandle[key];
    if (get().following[key]) return;
    set((state) => ({
      following: { ...state.following, [key]: true },
      relationshipByHandle: {
        ...state.relationshipByHandle,
        [key]: {
          ...(before ?? {
            isFollowing: false,
            isFollower: false,
            isFriend: false,
            friendRequestStatus: null,
            canMessage: true,
            followersCount: 0,
            followingCount: 0,
          }),
          isFollowing: true,
          followersCount: Math.max(0, (before?.followersCount ?? 0) + (before?.isFollowing ? 0 : 1)),
        },
      },
    }));
    try {
      await apiFollow(key);
    } catch (error) {
      set((state) => {
        const next = { ...state.following };
        delete next[key];
        return {
          following: next,
          relationshipByHandle: before
            ? { ...state.relationshipByHandle, [key]: before }
            : Object.fromEntries(Object.entries(state.relationshipByHandle).filter(([k]) => k !== key)),
        };
      });
      throw error;
    }
  },
  follow: (handle) => { void get().followNow(handle).catch(() => undefined); },
  unfollowNow: async (handle) => {
    const key = normalizeHandle(handle);
    if (!key) return;
    const before = get().relationshipByHandle[key];
    if (!get().following[key]) return;
    set((state) => {
      const next = { ...state.following };
      delete next[key];
      return {
        following: next,
        relationshipByHandle: before
          ? {
              ...state.relationshipByHandle,
              [key]: { ...before, isFollowing: false, followersCount: Math.max(0, before.followersCount - 1) },
            }
          : state.relationshipByHandle,
      };
    });
    try {
      await apiUnfollow(key);
    } catch (error) {
      set((state) => ({
        following: { ...state.following, [key]: true },
        relationshipByHandle: before ? { ...state.relationshipByHandle, [key]: before } : state.relationshipByHandle,
      }));
      throw error;
    }
  },
  unfollow: (handle) => { void get().unfollowNow(handle).catch(() => undefined); },
  unfriendNow: async (userId, handle) => {
    const key = normalizeHandle(handle ?? '');
    const before = get().relationshipByUserId[userId] ?? (key ? get().relationshipByHandle[key] : undefined);
    if (!before?.isFriend) return;
    const next = { ...before, isFriend: false, canMessage: before.canMessage };
    set((state) => ({
      relationshipByUserId: { ...state.relationshipByUserId, [userId]: next },
      relationshipByHandle: key ? { ...state.relationshipByHandle, [key]: next } : state.relationshipByHandle,
    }));
    try {
      await apiUnfriend(userId);
    } catch (error) {
      set((state) => ({
        relationshipByUserId: { ...state.relationshipByUserId, [userId]: before },
        relationshipByHandle: key ? { ...state.relationshipByHandle, [key]: before } : state.relationshipByHandle,
      }));
      throw error;
    }
  },
  followIfNeeded: (handle) => {
    const key = normalizeHandle(handle);
    if (!key || get().following[key]) return false;
    get().follow(key);
    return true;
  },
  hydrateFromServer: async () => {
    const handles = await apiListFollowing();
    set((state) => {
      const following: Record<string, true> = {};
      for (const h of handles) following[normalizeHandle(h)] = true;
      const relationshipByHandle = { ...state.relationshipByHandle };
      for (const key of Object.keys(relationshipByHandle)) {
        relationshipByHandle[key] = {
          ...relationshipByHandle[key],
          isFollowing: Boolean(following[key]),
        };
      }
      return { following, relationshipByHandle };
    });
  },
  reset: () => set({ following: {}, relationshipByUserId: {}, relationshipByHandle: {} }),
}));
