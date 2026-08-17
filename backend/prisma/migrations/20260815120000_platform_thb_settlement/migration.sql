-- Marketplace THB settlement: hold after complete, weekly seller payout, platform books

ALTER TABLE "MarketplaceGpPolicy" ADD COLUMN IF NOT EXISTS "holdDaysAfterComplete" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "MarketplaceGpPolicy" ADD COLUMN IF NOT EXISTS "payoutCycleDays" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "settlementStatus" TEXT NOT NULL DEFAULT 'HELD';
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "buyerConfirmedAt" TIMESTAMP(3);
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "sellerConfirmedAt" TIMESTAMP(3);
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "returnStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "returnRequestedAt" TIMESTAMP(3);
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "releaseEligibleAt" TIMESTAMP(3);
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "payoutBatchId" TEXT;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "paidOutAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CommerceOrder_settlementStatus_releaseEligibleAt_idx"
  ON "CommerceOrder"("settlementStatus", "releaseEligibleAt");
CREATE INDEX IF NOT EXISTS "CommerceOrder_payoutBatchId_idx"
  ON "CommerceOrder"("payoutBatchId");

CREATE TABLE IF NOT EXISTS "PlatformThbLedger" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "merchantId" TEXT,
    "orderId" TEXT,
    "batchId" TEXT,
    "side" TEXT NOT NULL,
    "amountThb" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "memo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformThbLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformThbLedger_account_createdAt_idx" ON "PlatformThbLedger"("account", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformThbLedger_orderId_idx" ON "PlatformThbLedger"("orderId");
CREATE INDEX IF NOT EXISTS "PlatformThbLedger_merchantId_createdAt_idx" ON "PlatformThbLedger"("merchantId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformThbLedger_batchId_idx" ON "PlatformThbLedger"("batchId");

CREATE TABLE IF NOT EXISTS "MerchantPayoutAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "accountName" TEXT,
    "bankName" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantPayoutAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MerchantPayoutAccount_merchantId_kind_key" ON "MerchantPayoutAccount"("merchantId", "kind");
CREATE INDEX IF NOT EXISTS "MerchantPayoutAccount_merchantId_idx" ON "MerchantPayoutAccount"("merchantId");

CREATE TABLE IF NOT EXISTS "PayoutBatch" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "totalThb" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "merchantCount" INTEGER NOT NULL DEFAULT 0,
    "runBy" TEXT,
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayoutBatch_status_scheduledFor_idx" ON "PayoutBatch"("status", "scheduledFor");
