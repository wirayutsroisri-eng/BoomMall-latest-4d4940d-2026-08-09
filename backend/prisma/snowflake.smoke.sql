-- Run after applying 20260826180000_snowflake_canary.
-- The transaction is rolled back so this test leaves no generator state behind.
BEGIN;

SET LOCAL app.snowflake_node_id = '7';

DO $$
DECLARE
  sample_id BIGINT;
  duplicate_count BIGINT;
  out_of_order_count BIGINT;
BEGIN
  CREATE TEMP TABLE generated_snowflakes (
    ordinal BIGSERIAL PRIMARY KEY,
    id BIGINT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO generated_snowflakes (id)
  SELECT generate_snowflake_id()
  FROM generate_series(1, 10000);

  SELECT COUNT(*) - COUNT(DISTINCT id)
    INTO duplicate_count
    FROM generated_snowflakes;

  IF duplicate_count <> 0 THEN
    RAISE EXCEPTION 'Snowflake collision test failed: % duplicates', duplicate_count;
  END IF;

  SELECT COUNT(*)
    INTO out_of_order_count
    FROM (
      SELECT id, lag(id) OVER (ORDER BY ordinal) AS previous_id
      FROM generated_snowflakes
    ) ordered_ids
    WHERE previous_id IS NOT NULL AND id <= previous_id;

  IF out_of_order_count <> 0 THEN
    RAISE EXCEPTION 'Snowflake ordering test failed: % IDs out of order', out_of_order_count;
  END IF;

  SELECT id INTO sample_id
  FROM generated_snowflakes
  ORDER BY ordinal
  LIMIT 1;

  IF ((sample_id >> 12) & 1023) <> 7 THEN
    RAISE EXCEPTION 'Snowflake node bits test failed for ID %', sample_id;
  END IF;

  IF sample_id < 0 THEN
    RAISE EXCEPTION 'Snowflake positivity test failed for ID %', sample_id;
  END IF;
END;
$$;

ROLLBACK;
