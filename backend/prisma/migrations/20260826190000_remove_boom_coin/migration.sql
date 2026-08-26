-- Permanently remove the discontinued Boom Coin subsystem.
-- Marketplace THB settlement, seller wallets, order escrow and inventory audit remain.
DROP TABLE IF EXISTS "SellerTopUpRequest" CASCADE;
DROP TABLE IF EXISTS "LedgerEntry" CASCADE;
DROP TABLE IF EXISTS "WalletTransaction" CASCADE;
DROP TABLE IF EXISTS "WalletAccount" CASCADE;
DROP TABLE IF EXISTS "Wallet" CASCADE;
DROP TABLE IF EXISTS "SystemSupply" CASCADE;

DROP TYPE IF EXISTS "TopUpStatus";
DROP TYPE IF EXISTS "EntrySide";
DROP TYPE IF EXISTS "TxStatus";
DROP TYPE IF EXISTS "TxType";
DROP TYPE IF EXISTS "AccountBucket";
DROP TYPE IF EXISTS "WalletStatus";
DROP TYPE IF EXISTS "WalletKind";
