import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BUYER_PAYMENT_META,
  type BuyerPaymentInstrument,
  type BuyerPaymentKind,
  validateBuyerPayment,
} from '../domain/buyer-payment';

type UpsertInput = {
  kind: BuyerPaymentKind;
  accountNo?: string;
  accountName?: string;
  bankName?: string;
};

type BuyerPaymentState = {
  instruments: BuyerPaymentInstrument[];
  upsert: (input: UpsertInput) => { ok: true; row: BuyerPaymentInstrument } | { ok: false; reason: string };
  remove: (id: string) => void;
};

function newId() {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function labelOf(input: UpsertInput) {
  return BUYER_PAYMENT_META[input.kind].title;
}

export const useBuyerPaymentStore = create<BuyerPaymentState>()(
  persist(
    (set, get) => ({
      instruments: [],

      upsert: (input) => {
        const err = validateBuyerPayment(input);
        if (err) return { ok: false, reason: err };
        const digits = (input.accountNo ?? '').replace(/\D/g, '');
        const now = new Date().toISOString();
        const current = get().instruments;
        const existing = current.find((a) => a.kind === input.kind);
        const row: BuyerPaymentInstrument = {
          id: existing?.id ?? newId(),
          kind: input.kind,
          label: labelOf(input),
          accountNo: input.kind === 'card' ? undefined : digits || undefined,
          last4: input.kind === 'card' ? digits.slice(-4) : undefined,
          accountName: input.accountName?.trim(),
          bankName: input.bankName?.trim(),
          updatedAt: now,
        };
        set({
          instruments: existing
            ? current.map((a) => (a.id === existing.id ? row : a))
            : [...current, row],
        });
        return { ok: true, row };
      },

      remove: (id) => set({ instruments: get().instruments.filter((a) => a.id !== id) }),
    }),
    {
      name: 'boommall-buyer-payment-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ instruments: s.instruments }),
    },
  ),
);
