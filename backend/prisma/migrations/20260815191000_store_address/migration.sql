-- ที่อยู่ร้านสำหรับใบสรุปยอด / ส่งบัญชี-สรรพากร
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "address" TEXT;
