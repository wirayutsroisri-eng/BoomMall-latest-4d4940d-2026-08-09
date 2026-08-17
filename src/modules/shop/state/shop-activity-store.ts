import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ShopActivityEntry } from '../domain/shop-activity';

const CAP = 200;
const DEDUPE_MS = 45_000;

export type RecordShopActivityInput = {
  category: ShopActivityEntry['category'];
  title: string;
  subtitle?: string;
  targetId?: string;
};

type ShopActivityState = {
  entries: ShopActivityEntry[];
  record: (input: RecordShopActivityInput) => void;
  remove: (id: string) => void;
  clearCategory: (category: ShopActivityEntry['category']) => void;
  clearBrowsable: () => void;
  importEntries: (rows: ShopActivityEntry[]) => void;
};

function newId() {
  return `shop-act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameKey(a: ShopActivityEntry, input: RecordShopActivityInput) {
  if (a.category !== input.category) return false;
  if (input.targetId) return a.targetId === input.targetId;
  return a.title.trim().toLowerCase() === input.title.trim().toLowerCase();
}

export const useShopActivityStore = create<ShopActivityState>()(
  persist(
    (set, get) => ({
      entries: [],

      record: (input) => {
        const title = input.title.trim();
        if (!title) return;
        const now = Date.now();
        const at = new Date(now).toISOString();
        const current = get().entries;
        const existing = current.find((e) => sameKey(e, input));
        if (existing && now - Date.parse(existing.at) < DEDUPE_MS) {
          set({
            entries: [
              { ...existing, title, subtitle: input.subtitle ?? existing.subtitle, at },
              ...current.filter((e) => e.id !== existing.id),
            ].slice(0, CAP),
          });
          return;
        }
        const next: ShopActivityEntry = {
          id: newId(),
          category: input.category,
          title,
          subtitle: input.subtitle,
          targetId: input.targetId,
          at,
        };
        set({
          entries: [next, ...current.filter((e) => !sameKey(e, input))].slice(0, CAP),
        });
      },

      remove: (id) => set({ entries: get().entries.filter((e) => e.id !== id) }),

      clearCategory: (category) =>
        set({ entries: get().entries.filter((e) => e.category !== category) }),

      clearBrowsable: () => set({ entries: [] }),

      importEntries: (rows) => {
        if (!rows.length) return;
        const have = new Set(get().entries.map((e) => `${e.category}:${e.targetId ?? e.title}`));
        const extra = rows.filter((r) => !have.has(`${r.category}:${r.targetId ?? r.title}`));
        if (!extra.length) return;
        set({ entries: [...extra, ...get().entries].slice(0, CAP) });
      },
    }),
    {
      name: 'boommall-shop-activity-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);

export function recordShopActivity(input: RecordShopActivityInput) {
  useShopActivityStore.getState().record(input);
}
