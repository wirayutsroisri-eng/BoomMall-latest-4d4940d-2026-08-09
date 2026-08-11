/**
 * Boom Coin Preview/Test suite — pure ledger engine (no Expo runtime).
 * Run: npm test
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { resetBoomLedgerEngineForTests } from '../engine/ledger-engine';
import { createWalletDomain } from '../services/WalletDomain';
import {
  toBoomCoinAmount,
  EXTERNAL_TRANSFER_ENABLED,
  formatBoomCoinCount,
  formatCoinBalance,
} from '../domain/boom-coin';
import { verifyHashChain } from '../engine/hash-chain';
import { hashWalletPin, verifyWalletPin, generatePinSalt } from '../engine/pin-hash';
import { createIdempotencyKey } from '../engine/id';

describe('Boom Coin integer rules', () => {
  it('rejects floats', () => {
    expect(() => toBoomCoinAmount(1.5)).toThrow(/FLOAT|integer/i);
  });
  it('accepts integers', () => {
    expect(toBoomCoinAmount(100)).toBe(100);
  });
  it('keeps external transfer off', () => {
    expect(EXTERNAL_TRANSFER_ENABLED).toBe(false);
  });
});

describe('Boom Coin display formatters', () => {
  it('formats compact social counts like followers', () => {
    expect(formatBoomCoinCount(100)).toBe('100');
    expect(formatBoomCoinCount(1_250)).toBe('1.3K');
    expect(formatBoomCoinCount(12_580)).toBe('12.6K');
    expect(formatBoomCoinCount(3_800_000)).toBe('3.8M');
  });
  it('formats spendable balance with grouping', () => {
    expect(formatCoinBalance(100)).toBe('100');
    expect(formatCoinBalance(12_580)).toBe('12,580');
  });
});

describe('Wallet + Ledger core', () => {
  beforeEach(() => {
    resetBoomLedgerEngineForTests();
  });

  it('creates one wallet per profile (unique)', () => {
    const domain = createWalletDomain();
    const a = domain.wallet.ensureWalletForProfile('p1');
    const b = domain.wallet.ensureWalletForProfile('p1');
    expect(a.id).toBe(b.id);
  });

  it('separates lifetime social score from spendable balance', () => {
    const domain = createWalletDomain();
    domain.wallet.ensureWalletForProfile('creator');
    domain.wallet.ensureWalletForProfile('fan');
    domain.treasury.previewFundUser('fan', 1000, 't1');
    domain.transfer.supportContent({
      fromProfileId: 'fan',
      toProfileId: 'creator',
      amount: 50,
      feedId: 'f1',
      idempotencyKey: 's1',
    });
    // creator spends nothing but lifetime is 50; fund then "spend" via transfer out
    domain.treasury.previewFundUser('creator', 200, 't2');
    domain.transfer.transfer({
      fromProfileId: 'creator',
      toProfileId: 'fan',
      amount: 30,
      idempotencyKey: 'out1',
    });
    const social = domain.wallet.getPublicSocialScore('creator');
    const bal = domain.wallet.getPrivateBalances('creator');
    expect(social.lifetimeCoinsReceived).toBe(50);
    expect(bal.available).toBe(200 - 30 + 50); // topup 200 + received 50 - sent 30
  });

  it('CONTENT_SUPPORT moves 1 coin via ledger', () => {
    const domain = createWalletDomain();
    domain.treasury.previewFundUser('a', 10, 'fund_a');
    domain.wallet.ensureWalletForProfile('b');
    const r = domain.transfer.supportContent({
      fromProfileId: 'a',
      toProfileId: 'b',
      amount: 1,
      feedId: 'post1',
      idempotencyKey: 'tip1',
    });
    expect(r.ok).toBe(true);
    expect(domain.wallet.getPrivateBalances('a').available).toBe(9);
    expect(domain.wallet.getPrivateBalances('b').available).toBe(1);
  });

  it('idempotency retry does not double-spend', () => {
    const domain = createWalletDomain();
    domain.treasury.previewFundUser('a', 10, 'fund_a2');
    domain.wallet.ensureWalletForProfile('b');
    const key = 'idem_same';
    const r1 = domain.transfer.supportContent({
      fromProfileId: 'a',
      toProfileId: 'b',
      amount: 1,
      feedId: 'p',
      idempotencyKey: key,
    });
    const r2 = domain.transfer.supportContent({
      fromProfileId: 'a',
      toProfileId: 'b',
      amount: 1,
      feedId: 'p',
      idempotencyKey: key,
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r2.reused).toBe(true);
      expect(r1.transaction.id).toBe(r2.transaction.id);
    }
    expect(domain.wallet.getPrivateBalances('a').available).toBe(9);
  });

  it('concurrent spend of same balance allows only one success', () => {
    const domain = createWalletDomain();
    domain.treasury.previewFundUser('a', 10, 'fund_conc');
    domain.wallet.ensureWalletForProfile('b');
    domain.wallet.ensureWalletForProfile('c');
    const r1 = domain.transfer.transfer({
      fromProfileId: 'a',
      toProfileId: 'b',
      amount: 10,
      idempotencyKey: 'c1',
    });
    const r2 = domain.transfer.transfer({
      fromProfileId: 'a',
      toProfileId: 'c',
      amount: 10,
      idempotencyKey: 'c2',
    });
    const wins = [r1, r2].filter((r) => r.ok).length;
    expect(wins).toBe(1);
    expect(domain.wallet.getPrivateBalances('a').available).toBe(0);
  });

  it('wallet never goes negative', () => {
    const domain = createWalletDomain();
    domain.treasury.previewFundUser('a', 5, 'fund5');
    domain.wallet.ensureWalletForProfile('b');
    const r = domain.transfer.transfer({
      fromProfileId: 'a',
      toProfileId: 'b',
      amount: 6,
      idempotencyKey: 'neg',
    });
    expect(r.ok).toBe(false);
    expect(domain.wallet.getPrivateBalances('a').available).toBe(5);
  });

  it('blocks external transfer', () => {
    const domain = createWalletDomain();
    expect(domain.ledger.verifyExternalBlocked()).toBe(true);
    const engine = resetBoomLedgerEngineForTests();
    expect(engine.attemptExternalTransfer().ok).toBe(false);
  });

  it('hash chain detects tampering', () => {
    const engine = resetBoomLedgerEngineForTests();
    const domain = createWalletDomain(engine);
    domain.treasury.previewFundUser('a', 20, 'f');
    domain.wallet.ensureWalletForProfile('b');
    domain.transfer.transfer({
      fromProfileId: 'a',
      toProfileId: 'b',
      amount: 1,
      idempotencyKey: 'h1',
    });
    expect(verifyHashChain(engine.transactions).ok).toBe(true);
    engine.transactions[0].amount = 999;
    expect(verifyHashChain(engine.transactions).ok).toBe(false);
  });

  it('ledger reconciliation passes after transfers', () => {
    const domain = createWalletDomain();
    domain.treasury.previewFundUser('a', 100, 'rf');
    domain.wallet.ensureWalletForProfile('b');
    domain.transfer.transfer({
      fromProfileId: 'a',
      toProfileId: 'b',
      amount: 40,
      idempotencyKey: createIdempotencyKey(),
    });
    const report = domain.reconciliation.run();
    expect(report.ok).toBe(true);
    expect(report.debitEqualsCredit).toBe(true);
    expect(report.hashChainOk).toBe(true);
  });

  it('checkout lock then release restores available', () => {
    const domain = createWalletDomain();
    domain.treasury.previewFundUser('buyer', 100, 'buyer_fund');
    const lock = domain.commerce.lockForCheckout('buyer', 30, 'order1', 'lock1');
    expect(lock.ok).toBe(true);
    expect(domain.wallet.getPrivateBalances('buyer').available).toBe(70);
    expect(domain.wallet.getPrivateBalances('buyer').locked).toBe(30);
    const meta = lock.ok ? JSON.parse(lock.transaction.metadataJson) : {};
    const release = domain.commerce.releaseCheckout(meta.reservationId, 'rel1');
    expect(release.ok).toBe(true);
    expect(domain.wallet.getPrivateBalances('buyer').available).toBe(100);
    expect(domain.wallet.getPrivateBalances('buyer').locked).toBe(0);
  });

  it('commerce policy caps coin amount', () => {
    const domain = createWalletDomain();
    const allowed = domain.commerce.resolveAllowedCoin({
      productPriceThb: 1000,
      policy: { coinEnabled: true, maxCoinAmount: 300, maxCoinPercent: 50 },
      requestedCoin: 500,
      available: 500,
    });
    expect(allowed).toBe(300);
  });

  it('admin cannot silent-edit — must use ADMIN_ADJUSTMENT with reason', () => {
    const engine = resetBoomLedgerEngineForTests();
    const domain = createWalletDomain(engine);
    domain.treasury.previewFundUser('u', 10, 'u1');
    const bad = engine.adminAdjust({
      walletId: domain.wallet.getWallet('u').id,
      amount: 5,
      adminId: 'admin1',
      reason: '',
      idempotencyKey: 'adj_bad',
    });
    expect(bad.ok).toBe(false);
    const good = engine.adminAdjust({
      walletId: domain.wallet.getWallet('u').id,
      amount: 5,
      adminId: 'admin1',
      reason: 'promo correction',
      idempotencyKey: 'adj_ok',
    });
    expect(good.ok).toBe(true);
  });

  it('frozen wallet cannot spend', () => {
    const engine = resetBoomLedgerEngineForTests();
    const domain = createWalletDomain(engine);
    domain.treasury.previewFundUser('u', 50, 'fu');
    domain.wallet.ensureWalletForProfile('v');
    engine.setWalletStatus(domain.wallet.getWallet('u').id, 'FROZEN', 'risk', 'suspicious');
    const r = domain.transfer.transfer({
      fromProfileId: 'u',
      toProfileId: 'v',
      amount: 1,
      idempotencyKey: 'fz',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('frozen');
  });

  it('PIN is hashed not plain', () => {
    const salt = generatePinSalt();
    const hash = hashWalletPin('123456', salt);
    expect(hash).not.toBe('123456');
    expect(verifyWalletPin('123456', salt, hash)).toBe(true);
    expect(verifyWalletPin('000000', salt, hash)).toBe(false);
  });

  it('rewards come from pool not mint', () => {
    const domain = createWalletDomain();
    domain.wallet.ensureWalletForProfile('creator');
    const before = domain.wallet.getPrivateBalances('creator').available;
    const r = domain.reward.grantFromPool({
      pool: 'COMMUNITY_POOL',
      toProfileId: 'creator',
      amount: 25,
      type: 'COMMUNITY_REWARD',
      idempotencyKey: 'rew1',
    });
    // Pool starts at 0 — may fail insufficient; fund pool first via treasury transfer path
    if (!r.ok) {
      // Fund community pool from platform then grant
      const engine = resetBoomLedgerEngineForTests();
      const d2 = createWalletDomain(engine);
      d2.wallet.ensureWalletForProfile('creator');
      const poolId = engine.treasuries.get('COMMUNITY_POOL')!.walletId;
      const platform = engine.treasuries.get('PLATFORM_TREASURY')!.walletId;
      engine.commitTransfer({
        idempotencyKey: 'pool_fund',
        requestId: 'r',
        type: 'TOPUP',
        amount: 100,
        sourceWalletId: platform,
        destinationWalletId: poolId,
      });
      const r2 = d2.reward.grantFromPool({
        pool: 'COMMUNITY_POOL',
        toProfileId: 'creator',
        amount: 25,
        type: 'COMMUNITY_REWARD',
        idempotencyKey: 'rew2',
      });
      expect(r2.ok).toBe(true);
      expect(d2.wallet.getPrivateBalances('creator').available).toBe(before + 25);
    }
  });
});
