-- Payment PIN + bank cooling-off + brute-force lock
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "payment_pin_hash" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "pin_failed_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "pin_locked_until" TIMESTAMP(3);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "bank_updated_at" TIMESTAMP(3);
