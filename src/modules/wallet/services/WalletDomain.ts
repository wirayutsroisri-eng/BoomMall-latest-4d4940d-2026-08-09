/**
 * Boom Wallet domain services — Preview/Test.
 * Other modules MUST call these services; never mutate ledger tables directly.
 */

import {
  EXTERNAL_TRANSFER_ENABLED,
  formatBoomCoinCount,
  formatCoinBalance,
} from '../domain/boom-coin';
import type { LedgerCommitResult, LedgerTransactionRow } from '../domain/ledger-types';
import {
  DEFAULT_CAPABILITIES,
  TX_LABEL_TH,
  type BoomTxType,
  type CoinCapability,
} from '../domain/transaction-types';
import { BoomLedgerEngine, getBoomLedgerEngine } from '../engine/ledger-engine';
import { createIdempotencyKey, createRequestId, createUlid } from '../engine/id';

export type AssetGatewayConfig = {
  network: 'INTERNAL';
  assetType: 'CLOSED_LOOP_UTILITY';
  externalTransfer: false;
  externalWallet: false;
  withdrawal: false;
};

export const ASSET_GATEWAY_V1: AssetGatewayConfig = {
  network: 'INTERNAL',
  assetType: 'CLOSED_LOOP_UTILITY',
  externalTransfer: false,
  externalWallet: false,
  withdrawal: false,
};

const capabilityRegistry = new Set<CoinCapability>(DEFAULT_CAPABILITIES);

export const CoinCapabilityRegistry = {
  list: () => [...capabilityRegistry],
  has: (c: CoinCapability) => capabilityRegistry.has(c),
  register: (c: CoinCapability) => capabilityRegistry.add(c),
};

type EventName =
  | 'COIN_SENT'
  | 'COIN_RECEIVED'
  | 'COIN_SPENT'
  | 'CONTENT_SUPPORTED'
  | 'WALLET_FROZEN'
  | 'RISK_DETECTED';

type EventHandler = (payload: Record<string, unknown>) => void;

class EventBus {
  private handlers = new Map<EventName, Set<EventHandler>>();
  on(event: EventName, handler: EventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }
  emit(event: EventName, payload: Record<string, unknown>) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
}

export const walletEventBus = new EventBus();

export class WalletService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}

  ensureWalletForProfile(profileId: string) {
    return this.engine.ensureProfileWallet(profileId);
  }

  getWallet(profileId: string) {
    return this.engine.getWalletByProfile(profileId) ?? this.engine.ensureProfileWallet(profileId);
  }

  getPublicSocialScore(profileId: string) {
    const lifetime = this.engine.getLifetimeReceived(profileId);
    return {
      lifetimeCoinsReceived: lifetime,
      display: formatBoomCoinCount(lifetime),
    };
  }

  getPrivateBalances(profileId: string) {
    const wallet = this.getWallet(profileId);
    const balances = this.engine.getBalances(wallet.id);
    return {
      walletId: wallet.id,
      status: wallet.status,
      ...balances,
      availableDisplay: formatCoinBalance(balances.available),
      thbEntitlement: balances.available,
    };
  }
}

export class LedgerService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}
  reconcile() {
    return this.engine.reconcile();
  }
  verifyExternalBlocked() {
    return !EXTERNAL_TRANSFER_ENABLED && this.engine.attemptExternalTransfer().ok === false;
  }
  checkpoint() {
    return this.engine.writeCheckpoint();
  }
}

export class WalletSecurityService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}

  enablePin(profileId: string, pin: string) {
    const wallet = new WalletService(this.engine).getWallet(profileId);
    this.engine.enablePin(wallet.id, pin);
  }

  requireStepUp(profileId: string, pin?: string): { ok: true } | { ok: false; reason: string } {
    const wallet = new WalletService(this.engine).getWallet(profileId);
    const sec = this.engine.security.get(wallet.id);
    if (!sec?.stepUpRequired) return { ok: true };
    if (sec.pinEnabled) {
      if (!pin) return { ok: false, reason: 'pin_required' };
      return this.engine.verifyStepUpPin(wallet.id, pin);
    }
    // Biometric hook — Preview treats presence of biometricEnabled as pass when no PIN set
    if (sec.biometricEnabled) return { ok: true };
    return { ok: false, reason: 'step_up_required' };
  }

  listDevices(profileId: string) {
    const wallet = new WalletService(this.engine).getWallet(profileId);
    return [...this.engine.devices.values()].filter((d) => d.walletId === wallet.id && !d.revoked);
  }

  registerDevice(profileId: string, deviceName: string, location?: string) {
    const wallet = new WalletService(this.engine).getWallet(profileId);
    return this.engine.registerDevice(wallet.id, deviceName, location);
  }

  revokeDevice(deviceId: string) {
    this.engine.revokeDevice(deviceId);
  }
}

export class CoinTransferService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}

  transfer(params: {
    fromProfileId: string;
    toProfileId: string;
    amount: number;
    type?: BoomTxType;
    idempotencyKey?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
    pin?: string;
  }): LedgerCommitResult {
    const security = new WalletSecurityService(this.engine);
    const step = security.requireStepUp(params.fromProfileId, params.pin);
    if (!step.ok) return { ok: false, reason: 'policy', message: step.reason };

    const from = new WalletService(this.engine).getWallet(params.fromProfileId);
    const to = new WalletService(this.engine).getWallet(params.toProfileId);
    const result = this.engine.commitTransfer({
      idempotencyKey: params.idempotencyKey ?? createIdempotencyKey('xfer'),
      requestId: createRequestId(),
      type: params.type ?? 'TRANSFER',
      amount: params.amount,
      sourceWalletId: from.id,
      destinationWalletId: to.id,
      referenceId: params.referenceId ?? null,
      metadata: params.metadata,
    });
    if (result.ok && !result.reused) {
      walletEventBus.emit('COIN_SENT', {
        from: params.fromProfileId,
        to: params.toProfileId,
        amount: params.amount,
        txId: result.transaction.id,
      });
      walletEventBus.emit('COIN_RECEIVED', {
        to: params.toProfileId,
        amount: params.amount,
        txId: result.transaction.id,
      });
    }
    return result;
  }

  supportContent(params: {
    fromProfileId: string;
    toProfileId: string;
    amount?: number;
    feedId: string;
    idempotencyKey?: string;
    pin?: string;
  }): LedgerCommitResult {
    if (!CoinCapabilityRegistry.has('SOCIAL_SUPPORT')) {
      return { ok: false, reason: 'policy', message: 'SOCIAL_SUPPORT disabled' };
    }
    const result = this.transfer({
      fromProfileId: params.fromProfileId,
      toProfileId: params.toProfileId,
      amount: params.amount ?? 1,
      type: 'CONTENT_SUPPORT',
      idempotencyKey: params.idempotencyKey ?? createIdempotencyKey(`support_${params.feedId}`),
      referenceId: params.feedId,
      metadata: { feedId: params.feedId },
      pin: params.pin,
    });
    if (result.ok) {
      walletEventBus.emit('CONTENT_SUPPORTED', {
        feedId: params.feedId,
        amount: params.amount ?? 1,
        txId: result.transaction.id,
      });
    }
    return result;
  }
}

export type CoinPolicy = {
  coinEnabled: boolean;
  maxCoinAmount: number | null;
  maxCoinPercent: number | null;
};

export class CoinCommerceService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}

  resolveAllowedCoin(params: {
    productPriceThb: number;
    policy: CoinPolicy;
    requestedCoin: number;
    available: number;
  }): number {
    if (!params.policy.coinEnabled) return 0;
    let max = params.requestedCoin;
    if (params.policy.maxCoinAmount != null) max = Math.min(max, params.policy.maxCoinAmount);
    if (params.policy.maxCoinPercent != null) {
      max = Math.min(max, Math.floor((params.productPriceThb * params.policy.maxCoinPercent) / 100));
    }
    max = Math.min(max, params.available, params.productPriceThb);
    return Math.max(0, Math.trunc(max));
  }

  lockForCheckout(profileId: string, amount: number, orderId: string, idempotencyKey?: string) {
    const wallet = new WalletService(this.engine).getWallet(profileId);
    return this.engine.lockCoins(
      wallet.id,
      amount,
      orderId,
      idempotencyKey ?? createIdempotencyKey(`lock_${orderId}`),
    );
  }

  releaseCheckout(reservationId: string, idempotencyKey?: string) {
    return this.engine.releaseLock(
      reservationId,
      idempotencyKey ?? createIdempotencyKey(`rel_${reservationId}`),
    );
  }
}

export class TreasuryService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}
  previewFundUser(profileId: string, amount: number, idempotencyKey?: string) {
    const wallet = new WalletService(this.engine).getWallet(profileId);
    return this.engine.previewTopUpFromTreasury(
      wallet.id,
      amount,
      idempotencyKey ?? createIdempotencyKey('topup'),
    );
  }
}

export class RewardService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}

  /** Rewards MUST come from a pool — never mint. */
  grantFromPool(params: {
    pool: 'COMMUNITY_POOL' | 'CREATOR_POOL' | 'PROMOTION_POOL' | 'REWARD_POOL';
    toProfileId: string;
    amount: number;
    type: BoomTxType;
    idempotencyKey?: string;
  }) {
    const pool = this.engine.treasuries.get(params.pool);
    if (!pool) return { ok: false as const, reason: 'not_found' as const, message: 'Pool missing' };
    const to = new WalletService(this.engine).getWallet(params.toProfileId);
    return this.engine.commitTransfer({
      idempotencyKey: params.idempotencyKey ?? createIdempotencyKey('reward'),
      requestId: createRequestId(),
      type: params.type,
      amount: params.amount,
      sourceWalletId: pool.walletId,
      destinationWalletId: to.id,
      metadata: { pool: params.pool },
    });
  }
}

export class RiskService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}
  scoreTransfer(amount: number): number {
    if (amount >= 10_000) return 80;
    if (amount >= 1_000) return 40;
    return 5;
  }
  flag(walletId: string, code: string, detail: string) {
    this.engine.riskEvents.push({
      id: createUlid(),
      walletId,
      code,
      detail,
      createdAt: new Date().toISOString(),
    });
    walletEventBus.emit('RISK_DETECTED', { walletId, code, detail });
  }
}

export class ReconciliationService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}
  run() {
    return this.engine.reconcile();
  }
}

export class AuditService {
  constructor(private engine: BoomLedgerEngine = getBoomLedgerEngine()) {}
  list() {
    return this.engine.auditLogs.slice().reverse();
  }
}

export function describeTx(tx: LedgerTransactionRow, viewerWalletId: string): {
  sign: '+' | '-';
  label: string;
  amount: number;
} {
  const incoming = tx.destinationWalletId === viewerWalletId && tx.sourceWalletId !== viewerWalletId;
  const label = TX_LABEL_TH[tx.type] ?? tx.type;
  return {
    sign: incoming ? '+' : '-',
    label,
    amount: tx.amount,
  };
}

export function createWalletDomain(engine = getBoomLedgerEngine()) {
  return {
    wallet: new WalletService(engine),
    ledger: new LedgerService(engine),
    security: new WalletSecurityService(engine),
    transfer: new CoinTransferService(engine),
    commerce: new CoinCommerceService(engine),
    treasury: new TreasuryService(engine),
    reward: new RewardService(engine),
    risk: new RiskService(engine),
    reconciliation: new ReconciliationService(engine),
    audit: new AuditService(engine),
    gateway: ASSET_GATEWAY_V1,
    capabilities: CoinCapabilityRegistry,
    events: walletEventBus,
  };
}
