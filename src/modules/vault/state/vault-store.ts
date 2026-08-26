import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { VaultItem, VehicleRecord } from '../domain/types';

const PASSCODE_KEY = 'boommall.vault.passcode';

type VaultState = {
  unlocked: boolean;
  hasPasscode: boolean;
  items: VaultItem[];
  vehicles: VehicleRecord[];
  hydrate: () => Promise<void>;
  setPasscode: (code: string) => Promise<void>;
  unlockWithPasscode: (code: string) => Promise<boolean>;
  unlock: () => void;
  lock: () => void;
  addItem: (item: Omit<VaultItem, 'id' | 'updatedAt'> & { id?: string }) => void;
  removeItemByRef: (refId: string) => void;
  isSaved: (refId: string) => boolean;
  deleteAccountData: () => Promise<void>;
};

export const useVaultStore = create<VaultState>((set, get) => ({
  unlocked: false,
  hasPasscode: false,
  items: [],
  vehicles: [],
  hydrate: async () => {
    const existing = await SecureStore.getItemAsync(PASSCODE_KEY);
    set({ hasPasscode: Boolean(existing) });
  },
  setPasscode: async (code) => {
    await SecureStore.setItemAsync(PASSCODE_KEY, code);
    set({ hasPasscode: true, unlocked: true });
  },
  unlockWithPasscode: async (code) => {
    const stored = await SecureStore.getItemAsync(PASSCODE_KEY);
    if (stored === code) {
      set({ unlocked: true });
      return true;
    }
    return false;
  },
  unlock: () => set({ unlocked: true }),
  lock: () => set({ unlocked: false }),
  addItem: (item) =>
    set((state) => ({
      items: [
        {
          ...item,
          id: item.id ?? `v-${Date.now()}`,
          updatedAt: 'เมื่อสักครู่',
        },
        ...state.items,
      ],
    })),
  removeItemByRef: (refId) =>
    set((state) => ({ items: state.items.filter((i) => i.refId !== refId) })),
  isSaved: (refId) => get().items.some((i) => i.refId === refId),
  deleteAccountData: async () => {
    await SecureStore.deleteItemAsync(PASSCODE_KEY);
    set({ unlocked: false, hasPasscode: false, items: [], vehicles: [] });
  },
}));
