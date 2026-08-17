-- Domain policies: Auth/Profile, Marketplace GP audit, Social control

DO $$ BEGIN
  ALTER TYPE "TxType" ADD VALUE 'GP_SETTLEMENT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "TxType" ADD VALUE 'PSP_CAPTURE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "handle" TEXT,
    "role" TEXT NOT NULL DEFAULT 'BUYER',
    "shopId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX IF NOT EXISTS "UserProfile_shopId_idx" ON "UserProfile"("shopId");

CREATE TABLE IF NOT EXISTS "EulaAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHint" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "EulaAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EulaAcceptance_userId_policyKey_version_key" ON "EulaAcceptance"("userId", "policyKey", "version");
CREATE INDEX IF NOT EXISTS "EulaAcceptance_policyKey_version_idx" ON "EulaAcceptance"("policyKey", "version");

DO $$ BEGIN
  ALTER TABLE "EulaAcceptance" ADD CONSTRAINT "EulaAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MarketplaceAuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "amountThb" BIGINT,
    "gpBps" INTEGER,
    "gpAmountThb" BIGINT,
    "pspRef" TEXT,
    "ledgerTxId" TEXT,
    "detailJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketplaceAuditLog_createdAt_idx" ON "MarketplaceAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "MarketplaceAuditLog_action_createdAt_idx" ON "MarketplaceAuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketplaceAuditLog_entityType_entityId_idx" ON "MarketplaceAuditLog"("entityType", "entityId");

CREATE TABLE IF NOT EXISTS "SocialControlPolicy" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL_SOCIAL',
    "maxMessagesPerMinute" INTEGER NOT NULL DEFAULT 30,
    "maxMessagesPerDay" INTEGER NOT NULL DEFAULT 2000,
    "mediaRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "textRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "requireEulaForChat" BOOLEAN NOT NULL DEFAULT true,
    "eulaVersion" TEXT NOT NULL DEFAULT 'c4-2026.1',
    "reportBlockEnabled" BOOLEAN NOT NULL DEFAULT true,
    "moderationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "SocialControlPolicy_pkey" PRIMARY KEY ("id")
);
