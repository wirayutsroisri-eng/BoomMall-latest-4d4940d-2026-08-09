/**
 * In-memory append-only double-entry Boom Coin ledger (Preview/Test Source of Truth).
 * Frontend never mutates balances directly — only TransferIntent commits.
 */

import {
  BOOM_COIN_ASSET_ID,
  BOOM_COIN_NAME,
  BOOM_COIN_SYMBOL,
  EXTERNAL_TRANSFER_ENABLED,
  toBoomCoinAmount,
} from '../domain/boom-coin';
import type {
  AuditLogRow,
  CoinReservationRow,
  CoinSocialStatsRow,
  IdempotencyRow,
  LedgerCheckpointRow,
  LedgerCommitResult,
  LedgerEntryRow,
  LedgerTransactionRow,
  RiskEventRow,
  TransferIntent,
  TreasuryAccountRow,
  WalletAccountRow,
  WalletDeviceRow,
  WalletRow,
  WalletSecurityRow,
} from '../domain/ledger-types';
import type { AccountBucket, BoomTxType, TreasuryCode, WalletStatus } from '../domain/transaction-types';
import { GENESIS_HASH, hashLedgerRecord, verifyHashChain } from './hash-chain';
import { createUlid } from './id';
import { generatePinSalt, hashWalletPin, pinLockDelayMs, verifyWalletPin } from './pin-hash';

function nowIso() {
  return new Date().toISOString();
}

function accountId(walletId: string, bucket: AccountBucket) {
  return `${walletId}:${bucket}`;
}

export class BoomLedgerEngine {
  readonly assets = [
    {
      id: BOOM_COIN_ASSET_ID,
      code: 'BOOM_COIN' as const,
      name: BOOM_COIN_NAME,
      symbol: BOOM_COIN_SYMBOL,
      network: 'INTERNAL' as const,
      assetType: 'CLOSED_LOOP_UTILITY' as const,
      externalTransfer: false as const,
      withdrawal: false as const,
    },
  ];

  wallets = new Map<string, WalletRow>();
  accounts = new Map<string, WalletAccountRow>();
  transactions: LedgerTransactionRow[] = [];
  entries: LedgerEntryRow[] = [];
  security = new Map<string, WalletSecurityRow>();
  devices = new Map<string, WalletDeviceRow>();
  socialStats = new Map<string, CoinSocialStatsRow>();
  idempotency = new Map<string, IdempotencyRow>();
  treasuries = new Map<TreasuryCode, TreasuryAccountRow>();
  reservations = new Map<string, CoinReservationRow>();
  riskEvents: RiskEventRow[] = [];
  auditLogs: AuditLogRow[] = [];
  checkpoints: LedgerCheckpointRow[] = [];

  private lastHash = GENESIS_HASH;
  private profileWalletIndex = new Map<string, string>();

  constructor() {
    this.bootstrapTreasury();
  }

  private bootstrapTreasury() {
    const codes: TreasuryCode[] = [
      'PLATFORM_TREASURY',
      'REWARD_POOL',
      'COMMUNITY_POOL',
      'CREATOR_POOL',
      'ADS_POOL',
      'MERCHANT_POOL',
      'SHIPPING_POOL',
      'AFFILIATE_POOL',
      'WAREHOUSE_POOL',
      'PROMOTION_POOL',
      'RESERVE_POOL',
    ];
    for (const code of codes) {
      const wallet = this.createSystemWallet(`system:${code}`, code);
      this.treasuries.set(code, { code, walletId: wallet.id });
    }
    // Seed PLATFORM_TREASURY available with preview mint (not user-facing faucet UI in prod)
    const platform = this.treasuries.get('PLATFORM_TREASURY')!;
    this.creditBucket(platform.walletId, 'available', 100_000_000, 'seed');
  }

  private createSystemWallet(profileId: string, label: string): WalletRow {
    const id = `wlt_${label}`;
    const wallet: WalletRow = {
      id,
      profileId,
      assetId: BOOM_COIN_ASSET_ID,
      status: 'NORMAL',
      createdAt: nowIso(),
    };
    this.wallets.set(id, wallet);
    this.profileWalletIndex.set(profileId, id);
    for (const bucket of ['available', 'pending', 'locked'] as AccountBucket[]) {
      const acc: WalletAccountRow = {
        id: accountId(id, bucket),
        walletId: id,
        bucket,
        balance: 0,
        version: 0,
      };
      this.accounts.set(acc.id, acc);
    }
    this.security.set(id, {
      walletId: id,
      pinHash: null,
      pinSalt: null,
      pinEnabled: false,
      biometricEnabled: true,
      stepUpRequired: true,
      pinFailCount: 0,
      pinLockedUntil: null,
      updatedAt: nowIso(),
    });
    return wallet;
  }

  /** Unique: one Boom Coin wallet per profile. */
  ensureProfileWallet(profileId: string): WalletRow {
    const existingId = this.profileWalletIndex.get(profileId);
    if (existingId) {
      const w = this.wallets.get(existingId);
      if (w) return w;
    }
    const id = `wlt_${profileId}`;
    if (this.wallets.has(id)) return this.wallets.get(id)!;

    const wallet: WalletRow = {
      id,
      profileId,
      assetId: BOOM_COIN_ASSET_ID,
      status: 'NORMAL',
      createdAt: nowIso(),
    };
    this.wallets.set(id, wallet);
    this.profileWalletIndex.set(profileId, id);
    for (const bucket of ['available', 'pending', 'locked'] as AccountBucket[]) {
      const acc: WalletAccountRow = {
        id: accountId(id, bucket),
        walletId: id,
        bucket,
        balance: 0,
        version: 0,
      };
      this.accounts.set(acc.id, acc);
    }
    this.security.set(id, {
      walletId: id,
      pinHash: null,
      pinSalt: null,
      pinEnabled: false,
      biometricEnabled: true,
      stepUpRequired: true,
      pinFailCount: 0,
      pinLockedUntil: null,
      updatedAt: nowIso(),
    });
    if (!this.socialStats.has(profileId)) {
      this.socialStats.set(profileId, {
        profileId,
        lifetimeCoinsReceived: 0,
        updatedAt: nowIso(),
      });
    }
    this.auditLogs.push({
      id: createUlid(),
      actorId: 'system',
      action: 'WALLET_CREATED',
      detail: `profile=${profileId} wallet=${id}`,
      createdAt: nowIso(),
    });
    return wallet;
  }

  getWalletByProfile(profileId: string): WalletRow | null {
    const id = this.profileWalletIndex.get(profileId);
    return id ? this.wallets.get(id) ?? null : null;
  }

  getBalances(walletId: string): { available: number; pending: number; locked: number } {
    return {
      available: this.accounts.get(accountId(walletId, 'available'))?.balance ?? 0,
      pending: this.accounts.get(accountId(walletId, 'pending'))?.balance ?? 0,
      locked: this.accounts.get(accountId(walletId, 'locked'))?.balance ?? 0,
    };
  }

  getLifetimeReceived(profileId: string): number {
    return this.socialStats.get(profileId)?.lifetimeCoinsReceived ?? 0;
  }

  private getAccount(walletId: string, bucket: AccountBucket): WalletAccountRow {
    const acc = this.accounts.get(accountId(walletId, bucket));
    if (!acc) throw new Error(`ACCOUNT_MISSING:${walletId}:${bucket}`);
    return acc;
  }

  private creditBucket(walletId: string, bucket: AccountBucket, amount: number, _tag: string) {
    const acc = this.getAccount(walletId, bucket);
    acc.balance += amount;
    acc.version += 1;
  }

  private debitBucket(walletId: string, bucket: AccountBucket, amount: number) {
    const acc = this.getAccount(walletId, bucket);
    if (acc.balance < amount) throw new Error('INSUFFICIENT');
    acc.balance -= amount;
    acc.version += 1;
  }

  private assertNotFrozen(walletId: string) {
    const w = this.wallets.get(walletId);
    if (!w) throw new Error('WALLET_NOT_FOUND');
    if (w.status === 'FROZEN') throw new Error('FROZEN');
  }

  /** Preview-only: fund user wallet from PLATFORM_TREASURY (not external mint). */
  previewTopUpFromTreasury(walletId: string, amount: number, idempotencyKey: string): LedgerCommitResult {
    const treasury = this.treasuries.get('PLATFORM_TREASURY');
    if (!treasury) return { ok: false, reason: 'not_found', message: 'Treasury missing' };
    return this.commitTransfer({
      idempotencyKey,
      requestId: createUlid(),
      type: 'TOPUP',
      amount,
      sourceWalletId: treasury.walletId,
      destinationWalletId: walletId,
      metadata: { channel: 'preview_treasury' },
    });
  }

  commitTransfer(intent: TransferIntent): LedgerCommitResult {
    if (!EXTERNAL_TRANSFER_ENABLED && intent.metadata?.external === true) {
      return { ok: false, reason: 'external_forbidden', message: 'External transfer disabled' };
    }

    const existing = this.idempotency.get(intent.idempotencyKey);
    if (existing) {
      const tx = this.transactions.find((t) => t.id === existing.transactionId);
      if (tx) return { ok: true, transaction: tx, reused: true };
    }

    let amount: number;
    try {
      amount = toBoomCoinAmount(intent.amount);
    } catch {
      return { ok: false, reason: 'invalid', message: 'Amount must be positive integer' };
    }
    if (amount < 1) return { ok: false, reason: 'invalid', message: 'Amount must be >= 1' };

    if (intent.sourceWalletId === intent.destinationWalletId) {
      return { ok: false, reason: 'self_transfer', message: 'Cannot transfer to self' };
    }

    const source = this.wallets.get(intent.sourceWalletId);
    const dest = this.wallets.get(intent.destinationWalletId);
    if (!source || !dest) return { ok: false, reason: 'not_found', message: 'Wallet not found' };

    try {
      this.assertNotFrozen(intent.sourceWalletId);
      this.assertNotFrozen(intent.destinationWalletId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'frozen';
      if (msg === 'FROZEN') return { ok: false, reason: 'frozen', message: 'Wallet frozen' };
      return { ok: false, reason: 'not_found', message: msg };
    }

    const available = this.getAccount(intent.sourceWalletId, 'available').balance;
    if (available < amount) {
      return { ok: false, reason: 'insufficient', message: 'Insufficient Boom Coin' };
    }

    const createdAt = nowIso();
    const txId = createUlid();
    const previousHash = this.lastHash;
    const recordHash = hashLedgerRecord({
      previousHash,
      id: txId,
      type: intent.type,
      amount,
      sourceWalletId: intent.sourceWalletId,
      destinationWalletId: intent.destinationWalletId,
      createdAt,
      idempotencyKey: intent.idempotencyKey,
    });

    // Atomic mutation block
    try {
      this.debitBucket(intent.sourceWalletId, 'available', amount);
      this.creditBucket(intent.destinationWalletId, 'available', amount, intent.type);
    } catch {
      return { ok: false, reason: 'insufficient', message: 'Insufficient Boom Coin' };
    }

    const debitEntry: LedgerEntryRow = {
      id: createUlid(),
      transactionId: txId,
      walletAccountId: accountId(intent.sourceWalletId, 'available'),
      amount,
      side: 'debit',
      createdAt,
    };
    const creditEntry: LedgerEntryRow = {
      id: createUlid(),
      transactionId: txId,
      walletAccountId: accountId(intent.destinationWalletId, 'available'),
      amount: -amount,
      side: 'credit',
      createdAt,
    };

    if (debitEntry.amount + creditEntry.amount !== 0) {
      throw new Error('LEDGER_IMBALANCE');
    }

    const tx: LedgerTransactionRow = {
      id: txId,
      requestId: intent.requestId,
      idempotencyKey: intent.idempotencyKey,
      referenceId: intent.referenceId ?? null,
      type: intent.type,
      status: 'COMMITTED',
      amount,
      sourceWalletId: intent.sourceWalletId,
      destinationWalletId: intent.destinationWalletId,
      metadataJson: JSON.stringify(intent.metadata ?? {}),
      riskScore: intent.riskScore ?? 0,
      previousHash,
      recordHash,
      createdAt,
      confirmedAt: createdAt,
    };

    this.transactions.push(tx);
    this.entries.push(debitEntry, creditEntry);
    this.lastHash = recordHash;
    this.idempotency.set(intent.idempotencyKey, {
      key: intent.idempotencyKey,
      transactionId: txId,
      createdAt,
    });

    // Social projection: lifetime received (never decreases on spend)
    if (this.isSupportOrReceiveType(intent.type)) {
      const destWallet = this.wallets.get(intent.destinationWalletId);
      if (destWallet && !destWallet.profileId.startsWith('system:')) {
        const stats = this.socialStats.get(destWallet.profileId) ?? {
          profileId: destWallet.profileId,
          lifetimeCoinsReceived: 0,
          updatedAt: createdAt,
        };
        stats.lifetimeCoinsReceived += amount;
        stats.updatedAt = createdAt;
        this.socialStats.set(destWallet.profileId, stats);
      }
    }

    if (this.transactions.length % 25 === 0) {
      this.writeCheckpoint();
    }

    return { ok: true, transaction: tx, reused: false };
  }

  private isSupportOrReceiveType(type: BoomTxType): boolean {
    return (
      type === 'CONTENT_SUPPORT' ||
      type === 'COMMENT_SUPPORT' ||
      type === 'LIVE_SUPPORT' ||
      type === 'TRANSFER' ||
      type === 'CREATOR_REWARD' ||
      type === 'COMMUNITY_REWARD' ||
      type === 'AFFILIATE_COMMISSION' ||
      type === 'WAREHOUSE_COMMISSION' ||
      type === 'SELLER_COMMISSION' ||
      type === 'CAMPAIGN_REWARD' ||
      type === 'PROMOTION_REWARD' ||
      type === 'WATCH_REWARD'
    );
  }

  /** Checkout lock: available → locked */
  lockCoins(walletId: string, amount: number, referenceId: string, idempotencyKey: string): LedgerCommitResult {
    const n = toBoomCoinAmount(amount);
    this.assertNotFrozen(walletId);
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      const tx = this.transactions.find((t) => t.id === existing.transactionId);
      if (tx) return { ok: true, transaction: tx, reused: true };
    }
    if (this.getAccount(walletId, 'available').balance < n) {
      return { ok: false, reason: 'insufficient', message: 'Insufficient Boom Coin' };
    }
    const createdAt = nowIso();
    this.debitBucket(walletId, 'available', n);
    this.creditBucket(walletId, 'locked', n, 'lock');
    const reservationId = createUlid();
    this.reservations.set(reservationId, {
      id: reservationId,
      walletId,
      amount: n,
      status: 'LOCKED',
      referenceId,
      createdAt,
      updatedAt: createdAt,
    });

    const txId = createUlid();
    const previousHash = this.lastHash;
    const recordHash = hashLedgerRecord({
      previousHash,
      id: txId,
      type: 'RESERVE_LOCK',
      amount: n,
      sourceWalletId: walletId,
      destinationWalletId: walletId,
      createdAt,
      idempotencyKey,
    });
    const tx: LedgerTransactionRow = {
      id: txId,
      requestId: createUlid(),
      idempotencyKey,
      referenceId,
      type: 'RESERVE_LOCK',
      status: 'COMMITTED',
      amount: n,
      sourceWalletId: walletId,
      destinationWalletId: walletId,
      metadataJson: JSON.stringify({ reservationId }),
      riskScore: 0,
      previousHash,
      recordHash,
      createdAt,
      confirmedAt: createdAt,
    };
    this.transactions.push(tx);
    this.entries.push(
      {
        id: createUlid(),
        transactionId: txId,
        walletAccountId: accountId(walletId, 'available'),
        amount: n,
        side: 'debit',
        createdAt,
      },
      {
        id: createUlid(),
        transactionId: txId,
        walletAccountId: accountId(walletId, 'locked'),
        amount: -n,
        side: 'credit',
        createdAt,
      },
    );
    this.lastHash = recordHash;
    this.idempotency.set(idempotencyKey, { key: idempotencyKey, transactionId: txId, createdAt });
    return { ok: true, transaction: tx, reused: false };
  }

  releaseLock(reservationId: string, idempotencyKey: string): LedgerCommitResult {
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      const tx = this.transactions.find((t) => t.id === existing.transactionId);
      if (tx) return { ok: true, transaction: tx, reused: true };
    }
    const res = this.reservations.get(reservationId);
    if (!res || res.status !== 'LOCKED') {
      return { ok: false, reason: 'not_found', message: 'Reservation not found' };
    }
    const { walletId, amount: n } = res;
    const createdAt = nowIso();
    this.debitBucket(walletId, 'locked', n);
    this.creditBucket(walletId, 'available', n, 'release');
    res.status = 'RELEASED';
    res.updatedAt = createdAt;

    const txId = createUlid();
    const previousHash = this.lastHash;
    const recordHash = hashLedgerRecord({
      previousHash,
      id: txId,
      type: 'RESERVE_RELEASE',
      amount: n,
      sourceWalletId: walletId,
      destinationWalletId: walletId,
      createdAt,
      idempotencyKey,
    });
    const tx: LedgerTransactionRow = {
      id: txId,
      requestId: createUlid(),
      idempotencyKey,
      referenceId: res.referenceId,
      type: 'RESERVE_RELEASE',
      status: 'COMMITTED',
      amount: n,
      sourceWalletId: walletId,
      destinationWalletId: walletId,
      metadataJson: JSON.stringify({ reservationId }),
      riskScore: 0,
      previousHash,
      recordHash,
      createdAt,
      confirmedAt: createdAt,
    };
    this.transactions.push(tx);
    this.entries.push(
      {
        id: createUlid(),
        transactionId: txId,
        walletAccountId: accountId(walletId, 'locked'),
        amount: n,
        side: 'debit',
        createdAt,
      },
      {
        id: createUlid(),
        transactionId: txId,
        walletAccountId: accountId(walletId, 'available'),
        amount: -n,
        side: 'credit',
        createdAt,
      },
    );
    this.lastHash = recordHash;
    this.idempotency.set(idempotencyKey, { key: idempotencyKey, transactionId: txId, createdAt });
    return { ok: true, transaction: tx, reused: false };
  }

  captureLockToMerchant(
    reservationId: string,
    merchantWalletId: string,
    type: BoomTxType,
    idempotencyKey: string,
  ): LedgerCommitResult {
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      const tx = this.transactions.find((t) => t.id === existing.transactionId);
      if (tx) return { ok: true, transaction: tx, reused: true };
    }
    const res = this.reservations.get(reservationId);
    if (!res || res.status !== 'LOCKED') {
      return { ok: false, reason: 'not_found', message: 'Reservation not found' };
    }
    const { walletId, amount: n } = res;
    this.assertNotFrozen(walletId);
    this.assertNotFrozen(merchantWalletId);
    const createdAt = nowIso();
    this.debitBucket(walletId, 'locked', n);
    this.creditBucket(merchantWalletId, 'available', n, 'capture');
    res.status = 'CAPTURED';
    res.updatedAt = createdAt;

    const txId = createUlid();
    const previousHash = this.lastHash;
    const recordHash = hashLedgerRecord({
      previousHash,
      id: txId,
      type,
      amount: n,
      sourceWalletId: walletId,
      destinationWalletId: merchantWalletId,
      createdAt,
      idempotencyKey,
    });
    const tx: LedgerTransactionRow = {
      id: txId,
      requestId: createUlid(),
      idempotencyKey,
      referenceId: res.referenceId,
      type,
      status: 'COMMITTED',
      amount: n,
      sourceWalletId: walletId,
      destinationWalletId: merchantWalletId,
      metadataJson: JSON.stringify({ reservationId }),
      riskScore: 0,
      previousHash,
      recordHash,
      createdAt,
      confirmedAt: createdAt,
    };
    this.transactions.push(tx);
    this.entries.push(
      {
        id: createUlid(),
        transactionId: txId,
        walletAccountId: accountId(walletId, 'locked'),
        amount: n,
        side: 'debit',
        createdAt,
      },
      {
        id: createUlid(),
        transactionId: txId,
        walletAccountId: accountId(merchantWalletId, 'available'),
        amount: -n,
        side: 'credit',
        createdAt,
      },
    );
    this.lastHash = recordHash;
    this.idempotency.set(idempotencyKey, { key: idempotencyKey, transactionId: txId, createdAt });
    return { ok: true, transaction: tx, reused: false };
  }

  setWalletStatus(walletId: string, status: WalletStatus, actorId: string, reason: string) {
    const w = this.wallets.get(walletId);
    if (!w) throw new Error('WALLET_NOT_FOUND');
    w.status = status;
    this.auditLogs.push({
      id: createUlid(),
      actorId,
      action: 'WALLET_STATUS',
      detail: `${walletId} -> ${status}: ${reason}`,
      createdAt: nowIso(),
    });
  }

  enablePin(walletId: string, pin: string) {
    const sec = this.security.get(walletId);
    if (!sec) throw new Error('SECURITY_MISSING');
    const salt = generatePinSalt();
    sec.pinSalt = salt;
    sec.pinHash = hashWalletPin(pin, salt);
    sec.pinEnabled = true;
    sec.updatedAt = nowIso();
  }

  verifyStepUpPin(walletId: string, pin: string): { ok: true } | { ok: false; reason: string } {
    const sec = this.security.get(walletId);
    if (!sec) return { ok: false, reason: 'missing' };
    if (sec.pinLockedUntil && Date.parse(sec.pinLockedUntil) > Date.now()) {
      return { ok: false, reason: 'locked' };
    }
    if (!sec.pinEnabled || !sec.pinHash || !sec.pinSalt) {
      return { ok: false, reason: 'pin_not_set' };
    }
    const valid = verifyWalletPin(pin, sec.pinSalt, sec.pinHash);
    if (!valid) {
      sec.pinFailCount += 1;
      const delay = pinLockDelayMs(sec.pinFailCount);
      if (delay > 0) sec.pinLockedUntil = new Date(Date.now() + delay).toISOString();
      sec.updatedAt = nowIso();
      return { ok: false, reason: 'invalid' };
    }
    sec.pinFailCount = 0;
    sec.pinLockedUntil = null;
    sec.updatedAt = nowIso();
    return { ok: true };
  }

  registerDevice(walletId: string, deviceName: string, approxLocation?: string) {
    const id = createUlid();
    this.devices.set(id, {
      id,
      walletId,
      deviceName,
      lastSeenAt: nowIso(),
      approxLocation: approxLocation ?? null,
      revoked: false,
    });
    return id;
  }

  revokeDevice(deviceId: string) {
    const d = this.devices.get(deviceId);
    if (d) d.revoked = true;
  }

  listHistory(walletId: string, limit = 50): LedgerTransactionRow[] {
    return this.transactions
      .filter(
        (t) =>
          t.sourceWalletId === walletId ||
          t.destinationWalletId === walletId,
      )
      .slice()
      .reverse()
      .slice(0, limit);
  }

  writeCheckpoint() {
    const cp: LedgerCheckpointRow = {
      id: createUlid(),
      sequence: this.transactions.length,
      lastHash: this.lastHash,
      timestamp: nowIso(),
      signature: hashLedgerRecord({
        previousHash: this.lastHash,
        id: `cp_${this.transactions.length}`,
        type: 'CHECKPOINT',
        amount: this.transactions.length,
        sourceWalletId: null,
        destinationWalletId: null,
        createdAt: nowIso(),
        idempotencyKey: `cp_${this.transactions.length}`,
      }),
    };
    this.checkpoints.push(cp);
    return cp;
  }

  reconcile(): {
    ok: boolean;
    debitEqualsCredit: boolean;
    hashChainOk: boolean;
    negativeBalances: string[];
    duplicateIdempotency: boolean;
  } {
    const sum = this.entries.reduce((acc, e) => acc + e.amount, 0);
    const debitEqualsCredit = sum === 0;
    const hashChainOk = verifyHashChain(this.transactions).ok;
    const negativeBalances: string[] = [];
    for (const acc of this.accounts.values()) {
      if (acc.balance < 0) negativeBalances.push(acc.id);
    }
    const keys = [...this.idempotency.keys()];
    const duplicateIdempotency = keys.length !== new Set(keys).size;
    return {
      ok: debitEqualsCredit && hashChainOk && negativeBalances.length === 0 && !duplicateIdempotency,
      debitEqualsCredit,
      hashChainOk,
      negativeBalances,
      duplicateIdempotency,
    };
  }

  /** Forbidden: direct balance edit. Admin must use ADMIN_ADJUSTMENT via treasury. */
  adminAdjust(params: {
    walletId: string;
    amount: number;
    adminId: string;
    reason: string;
    idempotencyKey: string;
  }): LedgerCommitResult {
    if (!params.reason.trim()) {
      return { ok: false, reason: 'policy', message: 'Admin adjustment requires reason' };
    }
    const treasury = this.treasuries.get('PLATFORM_TREASURY')!;
    const amount = toBoomCoinAmount(params.amount);
    this.auditLogs.push({
      id: createUlid(),
      actorId: params.adminId,
      action: 'ADMIN_ADJUSTMENT',
      detail: `wallet=${params.walletId} amount=${amount} reason=${params.reason}`,
      createdAt: nowIso(),
    });
    if (amount > 0) {
      return this.commitTransfer({
        idempotencyKey: params.idempotencyKey,
        requestId: createUlid(),
        type: 'ADMIN_ADJUSTMENT',
        amount,
        sourceWalletId: treasury.walletId,
        destinationWalletId: params.walletId,
        metadata: { adminId: params.adminId, reason: params.reason },
      });
    }
    return this.commitTransfer({
      idempotencyKey: params.idempotencyKey,
      requestId: createUlid(),
      type: 'ADMIN_ADJUSTMENT',
      amount: Math.abs(amount),
      sourceWalletId: params.walletId,
      destinationWalletId: treasury.walletId,
      metadata: { adminId: params.adminId, reason: params.reason },
    });
  }

  attemptExternalTransfer(): LedgerCommitResult {
    return {
      ok: false,
      reason: 'external_forbidden',
      message: 'external_transfer_enabled=false — Boom Coin cannot leave BoomMall',
    };
  }
}

/** Singleton Preview engine for the app process. */
let sharedEngine: BoomLedgerEngine | null = null;

export function getBoomLedgerEngine(): BoomLedgerEngine {
  if (!sharedEngine) sharedEngine = new BoomLedgerEngine();
  return sharedEngine;
}

export function resetBoomLedgerEngineForTests(): BoomLedgerEngine {
  sharedEngine = new BoomLedgerEngine();
  return sharedEngine;
}
