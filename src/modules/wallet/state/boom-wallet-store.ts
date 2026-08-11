import { create } from 'zustand';
import { createWalletDomain } from '../services/WalletDomain';
import type { LedgerTransactionRow } from '../domain/ledger-types';
import { createIdempotencyKey } from '../engine/id';
import { getBoomLedgerEngine } from '../engine/ledger-engine';

const CURRENT_PROFILE_ID = 'profile_boom_rider';

type BoomWalletUiState = {
  ready: boolean;
  profileId: string;
  available: number;
  pending: number;
  locked: number;
  lifetimeCoinsReceived: number;
  history: LedgerTransactionRow[];
  hydrate: () => void;
  refresh: () => void;
  tipContent: (input: {
    toProfileId: string;
    toHandle: string;
    toName: string;
    feedId: string;
    amount?: number;
    idempotencyKey?: string;
  }) => { ok: true; balance: number; txId: string } | { ok: false; reason: 'insufficient' | 'invalid' | 'policy' };
  previewTopUp: (amount: number) => { ok: boolean; balance: number };
  enablePin: (pin: string) => void;
};

function snapshot(profileId: string) {
  const domain = createWalletDomain();
  domain.wallet.ensureWalletForProfile(profileId);
  const bal = domain.wallet.getPrivateBalances(profileId);
  const social = domain.wallet.getPublicSocialScore(profileId);
  const history = getBoomLedgerEngine().listHistory(bal.walletId, 80);
  return {
    available: bal.available,
    pending: bal.pending,
    locked: bal.locked,
    lifetimeCoinsReceived: social.lifetimeCoinsReceived,
    history,
  };
}

let seeded = false;

function seedPreview(profileId: string) {
  if (seeded) return;
  seeded = true;
  const domain = createWalletDomain();
  domain.wallet.ensureWalletForProfile(profileId);
  // Seed demo creator wallets
  domain.wallet.ensureWalletForProfile('creator_demo');
  domain.treasury.previewFundUser(profileId, 12480, 'seed_topup_user_v1');
  domain.security.registerDevice(profileId, 'iPhone Preview', 'จันทบุรี');
  // Demo lifetime ≠ available: grant social support into user then spend won't reduce lifetime
  domain.treasury.previewFundUser('creator_demo', 5000, 'seed_creator_v1');
  domain.transfer.supportContent({
    fromProfileId: 'creator_demo',
    toProfileId: profileId,
    amount: 100,
    feedId: 'seed-lifetime',
    idempotencyKey: 'seed_lifetime_support_v1',
  });
}

export const useBoomWalletStore = create<BoomWalletUiState>((set, get) => ({
  ready: false,
  profileId: CURRENT_PROFILE_ID,
  available: 0,
  pending: 0,
  locked: 0,
  lifetimeCoinsReceived: 0,
  history: [],
  hydrate: () => {
    const profileId = get().profileId;
    seedPreview(profileId);
    set({ ready: true, ...snapshot(profileId) });
  },
  refresh: () => {
    set({ ...snapshot(get().profileId) });
  },
  tipContent: (input) => {
    const domain = createWalletDomain();
    const amount = Math.trunc(input.amount ?? 1);
    if (!Number.isInteger(amount) || amount < 1) return { ok: false, reason: 'invalid' };
    const toProfileId =
      input.toProfileId ||
      `creator_${input.toHandle.replace(/^@/, '').toLowerCase()}`;
    domain.wallet.ensureWalletForProfile(toProfileId);
    const result = domain.transfer.supportContent({
      fromProfileId: get().profileId,
      toProfileId,
      amount,
      feedId: input.feedId,
      idempotencyKey:
        input.idempotencyKey ??
        createIdempotencyKey(`tip_${input.feedId}_${Date.now()}`),
    });
    get().refresh();
    if (!result.ok) {
      if (result.reason === 'insufficient') return { ok: false, reason: 'insufficient' };
      if (result.reason === 'invalid') return { ok: false, reason: 'invalid' };
      return { ok: false, reason: 'policy' };
    }
    return { ok: true, balance: get().available, txId: result.transaction.id };
  },
  previewTopUp: (amount) => {
    const domain = createWalletDomain();
    const result = domain.treasury.previewFundUser(
      get().profileId,
      Math.trunc(amount),
      createIdempotencyKey('ui_topup'),
    );
    get().refresh();
    return { ok: result.ok, balance: get().available };
  },
  enablePin: (pin) => {
    createWalletDomain().security.enablePin(get().profileId, pin);
  },
}));

export const BOOM_PROFILE_ID = CURRENT_PROFILE_ID;
