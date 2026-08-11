-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('USER', 'SELLER', 'TREASURY', 'REWARD_POOL', 'SYSTEM_MINT');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('NORMAL', 'LIMITED', 'REVIEW', 'FROZEN');

-- CreateEnum
CREATE TYPE "AccountBucket" AS ENUM ('AVAILABLE', 'PENDING', 'LOCKED');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('INITIAL_MINT', 'SELLER_TOPUP_MINT', 'TRANSFER', 'CONTENT_SUPPORT', 'REWARD_PAYOUT', 'REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'COMMITTED', 'FAILED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EntrySide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TopUpStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SystemSupply" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "totalMinted" BIGINT NOT NULL DEFAULT 0,
    "totalRevenueThb" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSupply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "kind" "WalletKind" NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "WalletStatus" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "bucket" "AccountBucket" NOT NULL DEFAULT 'AVAILABLE',
    "balance" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "amount" BIGINT NOT NULL,
    "referenceId" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "previousHash" TEXT NOT NULL,
    "recordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "walletAccountId" TEXT NOT NULL,
    "side" "EntrySide" NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "key" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SellerTopUpRequest" (
    "id" TEXT NOT NULL,
    "sellerWalletId" TEXT NOT NULL,
    "amountThb" BIGINT NOT NULL,
    "amountCoin" BIGINT NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "proofNote" TEXT,
    "status" "TopUpStatus" NOT NULL DEFAULT 'PENDING',
    "submittedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "idempotencyKey" TEXT,
    "walletTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "SellerTopUpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detailJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wallet_kind_idx" ON "Wallet"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_kind_ownerRef_key" ON "Wallet"("kind", "ownerRef");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_walletId_bucket_key" ON "WalletAccount"("walletId", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_requestId_key" ON "WalletTransaction"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_status_idx" ON "WalletTransaction"("type", "status");

-- CreateIndex
CREATE INDEX "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_walletAccountId_idx" ON "LedgerEntry"("walletAccountId");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_transactionId_key" ON "IdempotencyRecord"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerTopUpRequest_idempotencyKey_key" ON "SellerTopUpRequest"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SellerTopUpRequest_walletTransactionId_key" ON "SellerTopUpRequest"("walletTransactionId");

-- CreateIndex
CREATE INDEX "SellerTopUpRequest_status_createdAt_idx" ON "SellerTopUpRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerTopUpRequest" ADD CONSTRAINT "SellerTopUpRequest_sellerWalletId_fkey" FOREIGN KEY ("sellerWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerTopUpRequest" ADD CONSTRAINT "SellerTopUpRequest_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
