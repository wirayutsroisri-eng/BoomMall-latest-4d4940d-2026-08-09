/**
 * Back-compat adapter for existing tip/topUp callers.
 * All mutations go through Boom Ledger — no direct balance += .
 */
import { useBoomWalletStore } from './boom-wallet-store';

type TipInput = {
  amount: number;
  feedId: string;
  toHandle: string;
  toName: string;
};

type TipResult =
  | { ok: true; balance: number }
  | { ok: false; reason: 'insufficient' | 'invalid' };

/** Zustand-compatible selector surface used by HomeFeedScreen / TipBottomSheet. */
export function useWalletStore<T>(
  selector: (s: {
    balance: number;
    tip: (input: TipInput) => TipResult;
    topUp: (amount: number) => TipResult;
  }) => T,
): T {
  const available = useBoomWalletStore((s) => s.available);
  const tipContent = useBoomWalletStore((s) => s.tipContent);
  const previewTopUp = useBoomWalletStore((s) => s.previewTopUp);

  return selector({
    balance: available,
    tip: (input) => {
      const result = tipContent({
        toProfileId: `creator_${input.toHandle.replace(/^@/, '').toLowerCase()}`,
        toHandle: input.toHandle,
        toName: input.toName,
        feedId: input.feedId,
        amount: input.amount,
      });
      if (!result.ok) return { ok: false, reason: result.reason === 'policy' ? 'invalid' : result.reason };
      return { ok: true, balance: result.balance };
    },
    topUp: (amount) => {
      const result = previewTopUp(amount);
      if (!result.ok) return { ok: false, reason: 'invalid' };
      return { ok: true, balance: result.balance };
    },
  });
}

useWalletStore.getState = () => {
  const s = useBoomWalletStore.getState();
  return {
    balance: s.available,
    transactions: s.history,
    tip: (input: TipInput): TipResult => {
      const result = s.tipContent({
        toProfileId: `creator_${input.toHandle.replace(/^@/, '').toLowerCase()}`,
        toHandle: input.toHandle,
        toName: input.toName,
        feedId: input.feedId,
        amount: input.amount,
      });
      if (!result.ok) return { ok: false, reason: result.reason === 'policy' ? 'invalid' : result.reason };
      return { ok: true, balance: result.balance };
    },
    topUp: (amount: number): TipResult => {
      const result = s.previewTopUp(amount);
      if (!result.ok) return { ok: false, reason: 'invalid' };
      return { ok: true, balance: result.balance };
    },
  };
};
