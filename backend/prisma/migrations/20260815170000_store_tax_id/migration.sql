-- เลขภาษีร้าน สำหรับรายงานผู้ค้าส่งสรรพากร
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "tax_id" TEXT;
