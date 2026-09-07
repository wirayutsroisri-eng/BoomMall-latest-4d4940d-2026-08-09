-- Profile relationship state + idempotent direct-message identity.

ALTER TABLE "ChatConversation" ADD COLUMN IF NOT EXISTS "directKey" TEXT;

-- Keep at most one key when old data contains duplicate direct rooms. Existing
-- rows without a key remain discoverable by the legacy participant lookup.
WITH pairs AS (
  SELECT c.id,
         md5(string_agg(p."userId", ':' ORDER BY p."userId")) AS pair_key
  FROM "ChatConversation" c
  JOIN "ChatParticipant" p ON p."conversationId" = c.id
  WHERE c.type = 'DIRECT'
    AND c."contextOrderId" IS NULL
    AND c."contextProductId" IS NULL
  GROUP BY c.id
  HAVING COUNT(*) = 2
), ranked AS (
  SELECT pairs.*,
         ROW_NUMBER() OVER (PARTITION BY pair_key ORDER BY id) AS pair_rank
  FROM pairs
)
UPDATE "ChatConversation" c
SET "directKey" = ranked.pair_key
FROM ranked
WHERE c.id = ranked.id AND ranked.pair_rank = 1 AND c."directKey" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversation_directKey_key"
  ON "ChatConversation"("directKey");
