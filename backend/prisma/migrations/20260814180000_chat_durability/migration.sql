-- Chat durability: delivery receipts. Messages persist on send (DB is source of truth).

ALTER TABLE "ChatParticipant" ADD COLUMN IF NOT EXISTS "lastDeliveredAt" TIMESTAMP(3);
