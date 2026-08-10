import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StockStatus } from '@/modules/commerce/domain/types';

/**
 * Low-stock notification dedup: an alert fires only when a SKU *transitions*
 * into `low`/`out`. Recovering to `ready` re-arms the alert. No spam.
 */
type StockAlertsState = {
  seen: Record<string, StockStatus>;
  /** Compare with current statuses; returns variantIds that newly became low/out. */
  takeTransitions: (current: Record<string, StockStatus>) => string[];
};

export const useStockAlertsStore = create<StockAlertsState>()(
  persist(
    (set, get) => ({
      seen: {},
      takeTransitions: (current) => {
        const { seen } = get();
        const fresh: string[] = [];
        const nextSeen: Record<string, StockStatus> = { ...seen };
        for (const [variantId, status] of Object.entries(current)) {
          const prev = seen[variantId] ?? 'ready';
          if ((status === 'low' || status === 'out') && prev !== status) {
            fresh.push(variantId);
          }
          nextSeen[variantId] = status;
        }
        if (fresh.length || Object.keys(nextSeen).length !== Object.keys(seen).length) {
          set({ seen: nextSeen });
        }
        return fresh;
      },
    }),
    {
      name: 'boommall-stock-alerts',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
