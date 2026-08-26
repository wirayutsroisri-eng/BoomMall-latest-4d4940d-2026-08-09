import { afterEach, describe, expect, it } from 'vitest';
import { snowflakeIdForApi, useSnowflakeId } from './snowflake';

const original = process.env.USE_SNOWFLAKE_ID;

afterEach(() => {
  if (original == null) delete process.env.USE_SNOWFLAKE_ID;
  else process.env.USE_SNOWFLAKE_ID = original;
});

describe('Snowflake API feature flag', () => {
  it('keeps UUID-only responses by default', () => {
    delete process.env.USE_SNOWFLAKE_ID;
    expect(useSnowflakeId()).toBe(false);
    expect(snowflakeIdForApi(9_007_199_254_740_993n)).toBeUndefined();
  });

  it.each(['1', 'true', 'TRUE'])('serializes bigint exactly when enabled with %s', (flag) => {
    process.env.USE_SNOWFLAKE_ID = flag;
    expect(snowflakeIdForApi(9_007_199_254_740_993n)).toBe('9007199254740993');
  });
});
