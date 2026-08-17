ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "shippingFeeThb" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "CommerceOrder" ADD COLUMN IF NOT EXISTS "disputedAt" TIMESTAMP(3);

ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "balance_after" INTEGER;

ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "proof_of_transfer" TEXT;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "transferred_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL',
    "default_gp_percent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "auto_complete_days" INTEGER NOT NULL DEFAULT 7,
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "bank_account_name" TEXT,
    "bank_code" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_settings" ("id", "default_gp_percent", "auto_complete_days", "updated_at", "updated_by")
VALUES ('GLOBAL', 5, 7, CURRENT_TIMESTAMP, 'system')
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "custom_gp_percent" DOUBLE PRECISION,
    "available_balance" INTEGER NOT NULL DEFAULT 0,
    "pending_balance" INTEGER NOT NULL DEFAULT 0,
    "is_corporate" BOOLEAN NOT NULL DEFAULT false,
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "bank_account_name" TEXT,
    "bank_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "order_escrows" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "shipping_fee" INTEGER NOT NULL DEFAULT 0,
    "gp_percent" DOUBLE PRECISION NOT NULL,
    "gp_amount" INTEGER NOT NULL,
    "net_merchant_amount" INTEGER NOT NULL,
    "release_due_date" TIMESTAMP(3),
    "release_status" TEXT NOT NULL DEFAULT 'HELD',
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_escrows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_escrows_store_id_fkey"
      FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_escrows_order_id_key" ON "order_escrows"("order_id");
CREATE INDEX IF NOT EXISTS "order_escrows_store_id_release_status_idx" ON "order_escrows"("store_id", "release_status");
CREATE INDEX IF NOT EXISTS "order_escrows_release_status_release_due_date_idx" ON "order_escrows"("release_status", "release_due_date");
