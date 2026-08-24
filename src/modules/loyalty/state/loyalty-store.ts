import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DigitalWarranty, VipProfile } from '@/modules/knowledge/domain/types';

type LoyaltyState = {
  profile: VipProfile;
  warranties: DigitalWarranty[];
  updateProfile: (
    patch: Partial<
      Pick<
        VipProfile,
        | 'displayName'
        | 'handle'
        | 'bio'
        | 'websiteUrl'
        | 'avatarUri'
        | 'coverUri'
        | 'displayNameChangedAt'
        | 'handleChangedAt'
      >
    >,
  ) => void;
  /** Apple 5.1.1(v) — wipe local account profile */
  deleteAccount: () => void;
};

const DEFAULT_PROFILE: VipProfile = {
  displayName: '',
  handle: '',
  bio: '',
  websiteUrl: '',
  avatarUri: null,
  coverUri: null,
  loyaltyTier: 'Bronze',
  points: 0,
  technicianBadge: '',
  shopVerified: false,
  followingCount: 0,
  followersCount: 0,
  likesCount: 0,
};

function asFreshProfile(prev?: Partial<VipProfile> | null): VipProfile {
  return {
    ...DEFAULT_PROFILE,
    displayName: prev?.displayName?.trim() || DEFAULT_PROFILE.displayName,
    handle: prev?.handle?.trim() || DEFAULT_PROFILE.handle,
    bio: prev?.bio ?? '',
    websiteUrl: prev?.websiteUrl ?? '',
    avatarUri: prev?.avatarUri ?? null,
    coverUri: prev?.coverUri ?? null,
    displayNameChangedAt: prev?.displayNameChangedAt ?? null,
    handleChangedAt: prev?.handleChangedAt ?? null,
  };
}

export const useLoyaltyStore = create<LoyaltyState>()(
  persist(
    (set) => ({
      profile: { ...DEFAULT_PROFILE },
      warranties: [],
      updateProfile: (patch) =>
        set((state) => ({ profile: { ...state.profile, ...patch } })),
      deleteAccount: () =>
        set({
          profile: { ...DEFAULT_PROFILE },
          warranties: [],
        }),
    }),
    {
      name: 'boommall-profile-storage',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ profile: state.profile }),
      migrate: (persisted) => {
        const prev = persisted as { profile?: Partial<VipProfile> } | undefined;
        return { profile: asFreshProfile(prev?.profile) };
      },
    },
  ),
);
