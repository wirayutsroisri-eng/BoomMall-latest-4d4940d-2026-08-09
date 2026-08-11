import type {
  AccountBucket,
  BoomTxStatus,
  BoomTxType,
  TreasuryCode,
  WalletStatus,
} from './transaction-types';

export type AssetRow = {
  id: string;
  code: 'BOOM_COIN';
  name: string;
  symbol: string;
  network: 'INTERNAL';
  assetType: 'CLOSED_LOOP_UTILITY';
  externalTransfer: false;
  withdrawal: false;
};

export type WalletRow = {
  id: string;
  profileId: string;
  assetId: string;
  status: WalletStatus;
  createdAt: string;
};

export type WalletAccountRow = {
  id: string;
  walletId: string;
  bucket: AccountBucket;
  /** Projection only — ledger is source of truth. */
  balance: number;
  version: number;
};

export type LedgerTransactionRow = {
  id: string;
  requestId: string;
  idempotencyKey: string;
  referenceId: string | null;
  type: BoomTxType;
  status: BoomTxStatus;
  amount: number;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  metadataJson: string;
  riskScore: number;
  previousHash: string;
  recordHash: string;
  createdAt: string;
  confirmedAt: string | null;
};

export type LedgerEntryRow = {
  id: string;
  transactionId: string;
  walletAccountId: string;
  /** Positive = debit, negative = credit in classic accounting;
   *  We store signed: debit > 0, credit < 0, sum must be 0. */
  amount: number;
  side: 'debit' | 'credit';
  createdAt: string;
};

export type WalletSecurityRow = {
  walletId: string;
  pinHash: string | null;
  pinSalt: string | null;
  pinEnabled: boolean;
  biometricEnabled: boolean;
  stepUpRequired: boolean;
  pinFailCount: number;
  pinLockedUntil: string | null;
  updatedAt: string;
};

export type WalletDeviceRow = {
  id: string;
  walletId: string;
  deviceName: string;
  lastSeenAt: string;
  approxLocation: string | null;
  revoked: boolean;
};

export type CoinSocialStatsRow = {
  profileId: string;
  lifetimeCoinsReceived: number;
  updatedAt: string;
};

export type IdempotencyRow = {
  key: string;
  transactionId: string;
  createdAt: string;
};

export type TreasuryAccountRow = {
  code: TreasuryCode;
  walletId: string;
};

export type CoinReservationRow = {
  id: string;
  walletId: string;
  amount: number;
  status: 'LOCKED' | 'CAPTURED' | 'RELEASED';
  referenceId: string;
  createdAt: string;
  updatedAt: string;
};

export type RiskEventRow = {
  id: string;
  walletId: string | null;
  code: string;
  detail: string;
  createdAt: string;
};

export type AuditLogRow = {
  id: string;
  actorId: string;
  action: string;
  detail: string;
  createdAt: string;
};

export type LedgerCheckpointRow = {
  id: string;
  sequence: number;
  lastHash: string;
  timestamp: string;
  signature: string;
};

export type TransferIntent = {
  idempotencyKey: string;
  requestId: string;
  type: BoomTxType;
  amount: number;
  sourceWalletId: string;
  destinationWalletId: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
  riskScore?: number;
};

export type LedgerCommitResult = {
  ok: true;
  transaction: LedgerTransactionRow;
  reused: boolean;
} | {
  ok: false;
  reason:
    | 'insufficient'
    | 'invalid'
    | 'frozen'
    | 'external_forbidden'
    | 'self_transfer'
    | 'not_found'
    | 'policy';
  message: string;
};
