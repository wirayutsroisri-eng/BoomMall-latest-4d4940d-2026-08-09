/**
 * Boom Tree — Visual Reward System (UI layer only).
 * Progress / readiness come from Reward Engine (Preview mock clearly labeled).
 * Claiming MUST go through Ledger — animation never mints coins.
 */

export type BoomTreeStage = 'seedling' | 'growing' | 'ready' | 'coin_ready';

export type BoomTreeSnapshot = {
  /** 0–100 */
  rewardProgress: number;
  stage: BoomTreeStage;
  /** Backend event REWARD_READY */
  rewardReady: boolean;
  /** Pending claim amount confirmed by engine (not UI-invented). */
  pendingClaimAmount: number;
  /** Preview-only label for QA — never send to production APIs. */
  __previewSource: 'mock' | 'engine';
};

export function stageFromProgress(progress: number, rewardReady: boolean): BoomTreeStage {
  const p = Math.max(0, Math.min(100, Math.trunc(progress)));
  if (rewardReady && p >= 100) return 'coin_ready';
  if (p >= 100) return 'ready';
  if (p >= 35) return 'growing';
  return 'seedling';
}

export function treeEmoji(stage: BoomTreeStage): string {
  switch (stage) {
    case 'seedling':
      return '🌱';
    case 'growing':
      return '🌿';
    case 'ready':
      return '🌳';
    case 'coin_ready':
      return '🌳🪙';
  }
}

export function treeStageLabel(stage: BoomTreeStage): string {
  switch (stage) {
    case 'seedling':
      return 'Seedling';
    case 'growing':
      return 'Growing';
    case 'ready':
      return 'Ready';
    case 'coin_ready':
      return 'Coin Ready';
  }
}

/** Named Preview fixtures for UX review — not production wallet data. */
export const BOOM_TREE_PREVIEW_FIXTURES: Record<
  'seedling_10' | 'growing_72' | 'ready_100' | 'coin_ready',
  BoomTreeSnapshot
> = {
  seedling_10: {
    rewardProgress: 10,
    stage: 'seedling',
    rewardReady: false,
    pendingClaimAmount: 0,
    __previewSource: 'mock',
  },
  growing_72: {
    rewardProgress: 72,
    stage: 'growing',
    rewardReady: false,
    pendingClaimAmount: 0,
    __previewSource: 'mock',
  },
  ready_100: {
    rewardProgress: 100,
    stage: 'ready',
    rewardReady: false,
    pendingClaimAmount: 0,
    __previewSource: 'mock',
  },
  coin_ready: {
    rewardProgress: 100,
    stage: 'coin_ready',
    rewardReady: true,
    pendingClaimAmount: 1,
    __previewSource: 'mock',
  },
};
