/**
 * Preview/Test Boom Tree state — SEPARATE from Boom Ledger balances.
 * Never mutates wallet.available directly. Claims go through RewardService → Ledger.
 */
import { create } from 'zustand';
import {
  BOOM_TREE_PREVIEW_FIXTURES,
  stageFromProgress,
  type BoomTreeSnapshot,
} from '../domain/boom-tree';
import { createWalletDomain } from '../services/WalletDomain';
import { createIdempotencyKey } from '../engine/id';
import { getBoomLedgerEngine } from '../engine/ledger-engine';
import { useBoomWalletStore } from './boom-wallet-store';

type PopupState = {
  visible: boolean;
  amount: number;
  message: string;
};

type BoomTreeState = BoomTreeSnapshot & {
  popup: PopupState;
  claiming: boolean;
  lastClaimAnimToken: number;
  setPreviewFixture: (key: keyof typeof BOOM_TREE_PREVIEW_FIXTURES) => void;
  /** Simulate REWARD_READY from backend (Preview only). */
  previewMarkRewardReady: (amount?: number) => void;
  /**
   * Claim flow: UI → Reward Engine mock confirm → Ledger grant → refresh wallet.
   * Animation must run only after ledger success.
   */
  claimReward: () => Promise<
    | { ok: true; amount: number; txId: string }
    | { ok: false; reason: string }
  >;
  dismissPopup: () => void;
  /** Queue coalesced popup amounts. */
  showRewardPopup: (amount: number) => void;
};

const DEFAULT: BoomTreeSnapshot = {
  ...BOOM_TREE_PREVIEW_FIXTURES.growing_72,
};

export const useBoomTreeStore = create<BoomTreeState>((set, get) => ({
  ...DEFAULT,
  popup: { visible: false, amount: 0, message: '' },
  claiming: false,
  lastClaimAnimToken: 0,

  setPreviewFixture: (key) => {
    const fixture = BOOM_TREE_PREVIEW_FIXTURES[key];
    set({
      ...fixture,
      stage: stageFromProgress(fixture.rewardProgress, fixture.rewardReady),
    });
  },

  previewMarkRewardReady: (amount = 1) => {
    set({
      rewardProgress: 100,
      rewardReady: true,
      pendingClaimAmount: Math.max(1, Math.trunc(amount)),
      stage: 'coin_ready',
      __previewSource: 'mock',
    });
  },

  showRewardPopup: (amount) => {
    const n = Math.max(1, Math.trunc(amount));
    const prev = get().popup;
    if (prev.visible) {
      set({
        popup: {
          visible: true,
          amount: prev.amount + n,
          message: 'ต้นไม้ของคุณออกผลแล้ว',
        },
      });
      return;
    }
    set({
      popup: {
        visible: true,
        amount: n,
        message: 'ต้นไม้ของคุณออกผลแล้ว',
      },
    });
  },

  dismissPopup: () => set({ popup: { visible: false, amount: 0, message: '' } }),

  claimReward: async () => {
    const state = get();
    if (state.claiming) return { ok: false, reason: 'busy' };
    if (!state.rewardReady || state.pendingClaimAmount < 1) {
      return { ok: false, reason: 'not_ready' };
    }

    set({ claiming: true });
    const amount = state.pendingClaimAmount;
    const profileId = useBoomWalletStore.getState().profileId;

    try {
      // Ensure COMMUNITY_POOL has funds (Preview Reward Engine → Ledger)
      const engine = getBoomLedgerEngine();
      const domain = createWalletDomain(engine);
      const poolId = engine.treasuries.get('COMMUNITY_POOL')!.walletId;
      const platform = engine.treasuries.get('PLATFORM_TREASURY')!.walletId;
      engine.commitTransfer({
        idempotencyKey: createIdempotencyKey(`pool_refill_${Date.now()}`),
        requestId: createIdempotencyKey('req'),
        type: 'TOPUP',
        amount,
        sourceWalletId: platform,
        destinationWalletId: poolId,
        metadata: { preview: true, channel: 'reward_engine' },
      });

      const grant = domain.reward.grantFromPool({
        pool: 'COMMUNITY_POOL',
        toProfileId: profileId,
        amount,
        type: 'COMMUNITY_REWARD',
        idempotencyKey: createIdempotencyKey(`claim_${Date.now()}`),
      });

      if (!grant.ok) {
        set({ claiming: false });
        return { ok: false, reason: grant.message ?? 'ledger_failed' };
      }

      // REWARD_CLAIM_CONFIRMED → reset tree, refresh wallet, trigger animation
      useBoomWalletStore.getState().refresh();
      set({
        claiming: false,
        rewardReady: false,
        pendingClaimAmount: 0,
        rewardProgress: 8,
        stage: 'seedling',
        lastClaimAnimToken: Date.now(),
        __previewSource: 'mock',
      });
      get().showRewardPopup(amount);
      return { ok: true, amount, txId: grant.transaction.id };
    } catch (e) {
      set({ claiming: false });
      return { ok: false, reason: e instanceof Error ? e.message : 'error' };
    }
  },
}));
