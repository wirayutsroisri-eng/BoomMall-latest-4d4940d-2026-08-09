import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { maskAccountNo, validatePayout, type SellerPayoutKind } from '../domain/payout-accounts';

export type WithdrawDestination = {
  kind: Extract<SellerPayoutKind, 'promptpay' | 'bank_account'>;
  accountNo: string;
  accountName?: string;
  bankName?: string;
  updatedAt: string;
};

export type WithdrawRequest = {
  id: string;
  amount: number;
  status: 'requested' | 'cancelled';
  destinationLabel: string;
  createdAt: string;
};

type WithdrawState = {
  destination: WithdrawDestination | null;
  requests: WithdrawRequest[];
  setDestination: (input: {
    kind: WithdrawDestination['kind'];
    accountNo: string;
    accountName?: string;
    bankName?: string;
  }) => { ok: true } | { ok: false; reason: string };
  clearDestination: () => void;
  requestWithdraw: (amount: number) => { ok: true; request: WithdrawRequest } | { ok: false; reason: string };
  cancelRequest: (id: string) => void;
};

function destLabel(d: WithdrawDestination) {
  if (d.kind === 'promptpay') return `พร้อมเพย์ ${maskAccountNo(d.accountNo)}`;
  return `${d.bankName ?? 'ธนาคาร'} ${maskAccountNo(d.accountNo)}`.trim();
}

export function requestedWithdrawTotal(requests: WithdrawRequest[]) {
  return requests.filter((r) => r.status === 'requested').reduce((n, r) => n + r.amount, 0);
}

export const useSellerWithdrawStore = create<WithdrawState>()(
  persist(
    (set, get) => ({
      destination: null,
      requests: [],

      setDestination: (input) => {
        const err = validatePayout(input);
        if (err) return { ok: false, reason: err };
        set({
          destination: {
            kind: input.kind,
            accountNo: input.accountNo.replace(/\D/g, ''),
            accountName: input.accountName?.trim(),
            bankName: input.bankName?.trim(),
            updatedAt: new Date().toISOString(),
          },
        });
        return { ok: true };
      },

      clearDestination: () => set({ destination: null }),

      requestWithdraw: (amount) => {
        const dest = get().destination;
        if (!dest) return { ok: false, reason: 'ใส่บัญชีถอนเงินก่อน' };
        const n = Math.round(amount);
        if (!Number.isFinite(n) || n < 1) return { ok: false, reason: 'ใส่ยอดที่ต้องการถอน' };
        const request: WithdrawRequest = {
          id: `wd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          amount: n,
          status: 'requested',
          destinationLabel: destLabel(dest),
          createdAt: new Date().toISOString(),
        };
        set({ requests: [request, ...get().requests] });
        return { ok: true, request };
      },

      cancelRequest: (id) =>
        set({
          requests: get().requests.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)),
        }),
    }),
    {
      name: 'boommall-seller-withdraw-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ destination: s.destination, requests: s.requests }),
    },
  ),
);
