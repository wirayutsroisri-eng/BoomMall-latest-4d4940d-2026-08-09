-- VAT / WHT on the platform fee, recorded per order.
-- Both default to 0 so nothing changes until the rates are switched on in
-- platform settings — turning them on is an accounting decision, not a deploy.

ALTER TABLE "order_escrows" ADD COLUMN "vat_amount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_escrows" ADD COLUMN "wht_amount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "platform_settings" ADD COLUMN "vat_percent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "platform_settings" ADD COLUMN "wht_percent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- เปิด VAT ทีหลังได้จากหน้าแอดมิน โดยไม่ต้องแก้โค้ด
-- ตอนนี้ผู้รับเงินเป็นบุคคลธรรมดายังไม่จด VAT ทุกค่าจึงเริ่มที่ปิด
ALTER TABLE "platform_settings" ADD COLUMN "vat_registered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "vat_effective_from" TIMESTAMP(3);
ALTER TABLE "platform_settings" ADD COLUMN "company_tax_id" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "company_legal_name" TEXT;
