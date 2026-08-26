-- Snowflake-compatible 63-bit IDs for PostgreSQL 16.
-- Layout: 41-bit milliseconds since 2024-01-01 UTC | 10-bit node | 12-bit sequence.
-- UUID userId remains the primary key during the dual-ID canary period.

CREATE TABLE IF NOT EXISTS "SnowflakeGeneratorState" (
  "node_id" SMALLINT PRIMARY KEY,
  "last_timestamp_ms" BIGINT NOT NULL DEFAULT -1,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SnowflakeGeneratorState_node_id_check" CHECK ("node_id" BETWEEN 0 AND 1023),
  CONSTRAINT "SnowflakeGeneratorState_sequence_check" CHECK ("sequence" BETWEEN 0 AND 4095)
);

CREATE OR REPLACE FUNCTION generate_snowflake_id()
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
AS $$
DECLARE
  custom_epoch_ms CONSTANT BIGINT := 1704067200000; -- 2024-01-01T00:00:00Z
  node_setting TEXT;
  node_id_value INTEGER;
  current_ms BIGINT;
  previous_ms BIGINT;
  next_sequence INTEGER;
  generated_id BIGINT;
BEGIN
  node_setting := current_setting('app.snowflake_node_id', true);

  IF node_setting IS NULL OR node_setting !~ '^[0-9]+$' THEN
    RAISE EXCEPTION
      'app.snowflake_node_id must be configured for this database connection (0..1023)'
      USING ERRCODE = '22023';
  END IF;

  node_id_value := node_setting::INTEGER;
  IF node_id_value < 0 OR node_id_value > 1023 THEN
    RAISE EXCEPTION 'app.snowflake_node_id % is outside 0..1023', node_id_value
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO "SnowflakeGeneratorState" ("node_id")
  VALUES (node_id_value)
  ON CONFLICT ("node_id") DO NOTHING;

  LOOP
    -- Serialize generators sharing the same node. The row lock is held until
    -- the caller transaction ends, so ID-generating transactions must be short.
    SELECT "last_timestamp_ms", "sequence"
      INTO previous_ms, next_sequence
      FROM "SnowflakeGeneratorState"
      WHERE "node_id" = node_id_value
      FOR UPDATE;

    current_ms := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;

    IF current_ms < custom_epoch_ms THEN
      RAISE EXCEPTION 'system clock is before the Snowflake epoch';
    END IF;

    IF previous_ms > current_ms THEN
      RAISE EXCEPTION 'clock moved backwards by % ms', previous_ms - current_ms
        USING ERRCODE = '55000';
    END IF;

    IF previous_ms = current_ms THEN
      IF next_sequence >= 4095 THEN
        PERFORM pg_sleep(0.001);
        CONTINUE;
      END IF;
      next_sequence := next_sequence + 1;
    ELSE
      next_sequence := 0;
    END IF;

    UPDATE "SnowflakeGeneratorState"
      SET "last_timestamp_ms" = current_ms,
          "sequence" = next_sequence
      WHERE "node_id" = node_id_value;

    generated_id :=
      ((current_ms - custom_epoch_ms) << 22)
      | (node_id_value::BIGINT << 12)
      | next_sequence::BIGINT;

    IF generated_id < 0 THEN
      RAISE EXCEPTION 'generated Snowflake ID exceeded signed BIGINT range';
    END IF;

    RETURN generated_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION generate_snowflake_id() IS
  '63-bit Snowflake: 41-bit timestamp, 10-bit connection node setting, 12-bit sequence';

ALTER TABLE "UserProfile" ADD COLUMN "snowflake_id" BIGINT;
ALTER TABLE "AuthIdentity" ADD COLUMN "snowflake_id" BIGINT;
ALTER TABLE "SocialPost" ADD COLUMN "snowflake_id" BIGINT;
ALTER TABLE "SocialComment" ADD COLUMN "snowflake_id" BIGINT;
ALTER TABLE "Story" ADD COLUMN "snowflake_id" BIGINT;

-- Existing rows are backfilled through the same generator. PostgreSQL evaluates
-- the volatile function once per row. Node 0 is transaction-local here only;
-- runtime inserts must still receive their own configured node ID.
WITH migration_node AS MATERIALIZED (
  SELECT set_config(
    'app.snowflake_node_id',
    COALESCE(NULLIF(current_setting('app.snowflake_node_id', true), ''), '0'),
    true
  )
)
UPDATE "UserProfile" AS profile
  SET "snowflake_id" = generate_snowflake_id()
  FROM migration_node
  WHERE profile."snowflake_id" IS NULL;

WITH migration_node AS MATERIALIZED (
  SELECT set_config('app.snowflake_node_id', COALESCE(NULLIF(current_setting('app.snowflake_node_id', true), ''), '0'), true)
)
UPDATE "AuthIdentity" AS row SET "snowflake_id" = generate_snowflake_id()
FROM migration_node WHERE row."snowflake_id" IS NULL;

WITH migration_node AS MATERIALIZED (
  SELECT set_config('app.snowflake_node_id', COALESCE(NULLIF(current_setting('app.snowflake_node_id', true), ''), '0'), true)
)
UPDATE "SocialPost" AS row SET "snowflake_id" = generate_snowflake_id()
FROM migration_node WHERE row."snowflake_id" IS NULL;

WITH migration_node AS MATERIALIZED (
  SELECT set_config('app.snowflake_node_id', COALESCE(NULLIF(current_setting('app.snowflake_node_id', true), ''), '0'), true)
)
UPDATE "SocialComment" AS row SET "snowflake_id" = generate_snowflake_id()
FROM migration_node WHERE row."snowflake_id" IS NULL;

WITH migration_node AS MATERIALIZED (
  SELECT set_config('app.snowflake_node_id', COALESCE(NULLIF(current_setting('app.snowflake_node_id', true), ''), '0'), true)
)
UPDATE "Story" AS row SET "snowflake_id" = generate_snowflake_id()
FROM migration_node WHERE row."snowflake_id" IS NULL;

ALTER TABLE "UserProfile"
  ALTER COLUMN "snowflake_id" SET DEFAULT generate_snowflake_id(),
  ALTER COLUMN "snowflake_id" SET NOT NULL;

ALTER TABLE "AuthIdentity"
  ALTER COLUMN "snowflake_id" SET DEFAULT generate_snowflake_id(),
  ALTER COLUMN "snowflake_id" SET NOT NULL;
ALTER TABLE "SocialPost"
  ALTER COLUMN "snowflake_id" SET DEFAULT generate_snowflake_id(),
  ALTER COLUMN "snowflake_id" SET NOT NULL;
ALTER TABLE "SocialComment"
  ALTER COLUMN "snowflake_id" SET DEFAULT generate_snowflake_id(),
  ALTER COLUMN "snowflake_id" SET NOT NULL;
ALTER TABLE "Story"
  ALTER COLUMN "snowflake_id" SET DEFAULT generate_snowflake_id(),
  ALTER COLUMN "snowflake_id" SET NOT NULL;

CREATE UNIQUE INDEX "UserProfile_snowflake_id_key"
  ON "UserProfile"("snowflake_id");
CREATE UNIQUE INDEX "AuthIdentity_snowflake_id_key" ON "AuthIdentity"("snowflake_id");
CREATE UNIQUE INDEX "SocialPost_snowflake_id_key" ON "SocialPost"("snowflake_id");
CREATE UNIQUE INDEX "SocialComment_snowflake_id_key" ON "SocialComment"("snowflake_id");
CREATE UNIQUE INDEX "Story_snowflake_id_key" ON "Story"("snowflake_id");
