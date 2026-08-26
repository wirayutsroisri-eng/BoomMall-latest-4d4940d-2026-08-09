-- Canonicalize legacy handles before enforcing the production identity rule.
UPDATE "UserProfile"
SET "handle" = LOWER(REGEXP_REPLACE("handle", '^@+', ''))
WHERE "handle" IS NOT NULL;

-- Repair missing and duplicate legacy values deterministically. New account
-- creation uses the same unbranded user_<opaque id> shape in application code.
UPDATE "UserProfile"
SET "handle" = 'user_' || SUBSTRING(MD5("userId") FROM 1 FOR 12)
WHERE "handle" IS NULL OR LENGTH("handle") < 3;

WITH duplicates AS (
  SELECT "id", "handle", ROW_NUMBER() OVER (
    PARTITION BY LOWER("handle") ORDER BY "createdAt", "id"
  ) AS duplicate_number
  FROM "UserProfile"
)
UPDATE "UserProfile" AS profile
SET "handle" = LEFT(duplicates."handle", 17) || '_' || SUBSTRING(MD5(profile."userId") FROM 1 FOR 6)
FROM duplicates
WHERE profile."id" = duplicates."id" AND duplicates.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_handle_ci_key"
ON "UserProfile" (LOWER("handle"));
