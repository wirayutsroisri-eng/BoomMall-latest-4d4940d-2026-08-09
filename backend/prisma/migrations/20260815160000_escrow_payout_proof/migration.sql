ALTER TABLE "order_escrows" ADD COLUMN IF NOT EXISTS "payout_proof" TEXT;
ALTER TABLE "order_escrows" ADD COLUMN IF NOT EXISTS "paid_out_at" TIMESTAMP(3);
