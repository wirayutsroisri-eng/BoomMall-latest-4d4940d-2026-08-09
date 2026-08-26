BEGIN;
SET LOCAL app.snowflake_node_id = '23';

INSERT INTO "UserProfile" ("userId", "displayName", "handle", "updatedAt")
VALUES ('90000000-0000-4000-8000-000000000001', 'Snowflake Cascade Test', 'snowflake_cascade_test', now());

INSERT INTO "AuthIdentity" ("id", "userId", "provider", "providerUserId", "updatedAt")
VALUES ('90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'test', 'snowflake-cascade', now());

INSERT INTO "SocialPost" ("id", "authorId", "body", "updatedAt")
VALUES ('90000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000001', 'cascade test', now());

INSERT INTO "SocialComment" ("id", "postId", "authorId", "body")
VALUES ('90000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000001', 'cascade comment');

INSERT INTO "Story" ("id", "userId", "mediaType", "mediaUrl", "expiresAt")
VALUES ('90000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000001', 'IMAGE', 'https://example.invalid/test.jpg', now() + interval '1 day');

DO $$
DECLARE
  total_ids INTEGER;
  distinct_ids INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT snowflake_id)
  INTO total_ids, distinct_ids
  FROM (
    SELECT snowflake_id FROM "UserProfile" WHERE "userId" = '90000000-0000-4000-8000-000000000001'
    UNION ALL SELECT snowflake_id FROM "AuthIdentity" WHERE "id" = '90000000-0000-4000-8000-000000000002'
    UNION ALL SELECT snowflake_id FROM "SocialPost" WHERE "id" = '90000000-0000-4000-8000-000000000003'
    UNION ALL SELECT snowflake_id FROM "SocialComment" WHERE "id" = '90000000-0000-4000-8000-000000000004'
    UNION ALL SELECT snowflake_id FROM "Story" WHERE "id" = '90000000-0000-4000-8000-000000000005'
  ) generated;
  IF total_ids <> 5 OR distinct_ids <> 5 THEN
    RAISE EXCEPTION 'dual-ID generation failed: total %, distinct %', total_ids, distinct_ids;
  END IF;
END;
$$;

DELETE FROM "UserProfile" WHERE "userId" = '90000000-0000-4000-8000-000000000001';

DO $$
DECLARE remaining INTEGER;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM "AuthIdentity" WHERE "id" = '90000000-0000-4000-8000-000000000002') +
    (SELECT COUNT(*) FROM "SocialPost" WHERE "id" = '90000000-0000-4000-8000-000000000003') +
    (SELECT COUNT(*) FROM "SocialComment" WHERE "id" = '90000000-0000-4000-8000-000000000004') +
    (SELECT COUNT(*) FROM "Story" WHERE "id" = '90000000-0000-4000-8000-000000000005')
  INTO remaining;
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'account cascade failed: % child rows remain', remaining;
  END IF;
END;
$$;

ROLLBACK;
