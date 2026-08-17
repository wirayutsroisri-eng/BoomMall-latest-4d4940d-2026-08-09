-- Mall product / order context on chat rooms + last-message inbox index

ALTER TABLE "ChatConversation" ADD COLUMN IF NOT EXISTS "contextProductId" TEXT;
ALTER TABLE "ChatConversation" ADD COLUMN IF NOT EXISTS "contextOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "ChatConversation_lastMessageAt_idx"
  ON "ChatConversation"("lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatConversation_contextOrderId_idx"
  ON "ChatConversation"("contextOrderId");
CREATE INDEX IF NOT EXISTS "ChatConversation_type_contextProductId_idx"
  ON "ChatConversation"("type", "contextProductId");
