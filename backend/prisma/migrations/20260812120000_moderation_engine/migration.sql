-- Dynamic Moderation Engine: NL policies + soft-lock state (App Store 1.2)

CREATE TABLE "ModerationPolicy" (
    "id" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "parsedRules" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationState" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "currentRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "softLockedAt" TIMESTAMP(3),
    "autoUnlockAt" TIMESTAMP(3),
    "lockReason" TEXT,
    "lastReportId" TEXT,
    "policyId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModerationState_targetId_key" ON "ModerationState"("targetId");
CREATE INDEX "ModerationPolicy_isActive_createdAt_idx" ON "ModerationPolicy"("isActive", "createdAt");
CREATE INDEX "ModerationState_status_autoUnlockAt_idx" ON "ModerationState"("status", "autoUnlockAt");
CREATE INDEX "ModerationState_targetType_status_idx" ON "ModerationState"("targetType", "status");
