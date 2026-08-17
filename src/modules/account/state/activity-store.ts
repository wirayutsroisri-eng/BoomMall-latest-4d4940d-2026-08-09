import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActivityCategory, ActivityEntry } from '../domain/types';

const CAP = 200;
const DEDUPE_MS = 45_000;

export type RecordActivityInput = {
  category: Exclude<ActivityCategory, 'music'>;
  title: string;
  subtitle?: string;
  targetId?: string;
};

type ActivityState = {
  entries: ActivityEntry[];
  seeded: boolean;
  record: (input: RecordActivityInput) => void;
  remove: (id: string) => void;
  clearCategory: (category: Exclude<ActivityCategory, 'music'>) => void;
  clearAll: () => void;
  markSeeded: (entries: ActivityEntry[]) => void;
  dropShopDomainEntries: () => ActivityEntry[];
};

function newId() {
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameKey(a: ActivityEntry, input: RecordActivityInput) {
  if (a.category !== input.category) return false;
  if (input.targetId) return a.targetId === input.targetId;
  return a.title.trim().toLowerCase() === input.title.trim().toLowerCase();
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set, get) => ({
      entries: [],
      seeded: false,

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
        const next: ActivityEntry = {
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

      clearAll: () => set({ entries: [] }),

      markSeeded: (entries) => {
        if (get().seeded) return;
        set({
          seeded: true,
          entries: entries.length ? [...entries, ...get().entries].slice(0, CAP) : get().entries,
        });
      },

      dropShopDomainEntries: () => {
        const shopRows = get().entries.filter(
          (e) => e.category === 'shop' || (e.category === 'search' && e.subtitle === 'สินค้า'),
        );
        if (!shopRows.length) return shopRows;
        set({
          entries: get().entries.filter(
            (e) => e.category !== 'shop' && !(e.category === 'search' && e.subtitle === 'สินค้า'),
          ),
        });
        return shopRows;
      },
    }),
    {
      name: 'boommall-activity-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ entries: s.entries, seeded: s.seeded }),
    },
  ),
);

export function recordActivity(input: RecordActivityInput) {
  useActivityStore.getState().record(input);
}
