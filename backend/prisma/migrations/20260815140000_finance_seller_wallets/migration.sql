-- Finance & Settlement: กระเป๋าร้าน + ledger GP/VAT/WHT + คำขอถอน
-- หน่วยเงินในตารางนี้เป็นสตางค์ (1 บาท = 100)

CREATE TABLE IF NOT EXISTS "seller_wallets" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "available_balance" INTEGER NOT NULL DEFAULT 0,
    "pending_balance" INTEGER NOT NULL DEFAULT 0,
    "is_corporate" BOOLEAN NOT NULL DEFAULT false,
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "bank_account_name" TEXT,
    "bank_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seller_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "seller_wallets_seller_id_key" ON "seller_wallets"("seller_id");

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "order_id" TEXT,
    "withdrawal_id" TEXT,
    "type" TEXT NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "gp_fee" INTEGER NOT NULL,
    "vat_amount" INTEGER NOT NULL,
    "wht_amount" INTEGER NOT NULL,
    "net_amount" INTEGER NOT NULL,
    "gp_rate_bps" INTEGER NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_transactions_wallet_id_fkey"
      FOREIGN KEY ("wallet_id") REFERENCES "seller_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_order_id_type_key"
  ON "wallet_transactions"("order_id", "type");
CREATE INDEX IF NOT EXISTS "wallet_transactions_seller_id_created_at_idx"
  ON "wallet_transactions"("seller_id", "created_at");
CREATE INDEX IF NOT EXISTS "wallet_transactions_wallet_id_created_at_idx"
  ON "wallet_transactions"("wallet_id", "created_at");

CREATE TABLE IF NOT EXISTS "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "bank_account_name" TEXT,
    "note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "withdrawal_requests_wallet_id_fkey"
      FOREIGN KEY ("wallet_id") REFERENCES "seller_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "withdrawal_requests_status_created_at_idx"
  ON "withdrawal_requests"("status", "created_at");
CREATE INDEX IF NOT EXISTS "withdrawal_requests_seller_id_created_at_idx"
  ON "withdrawal_requests"("seller_id", "created_at");
