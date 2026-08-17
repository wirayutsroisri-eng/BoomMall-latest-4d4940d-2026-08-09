-- Hybrid payout: MANUAL vs AUTO + per-withdrawal channel metadata
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "payout_mode" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "auto_payout_max_limit" INTEGER NOT NULL DEFAULT 2000000;

ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_channel" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_provider" TEXT;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_ref" TEXT;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "manual_reason" TEXT;
