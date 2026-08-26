import { afterEach, describe, expect, it } from 'vitest';
import { buildDatabaseUrl, snowflakeNodeId } from './env';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Snowflake database connection configuration', () => {
  it('injects the node ID into every PostgreSQL connection', () => {
    process.env.NODE_ENV = 'test';
    process.env.SNOWFLAKE_NODE_ID = '17';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/app?schema=public';

    const url = new URL(buildDatabaseUrl());
    expect(url.searchParams.get('options')).toContain('-c app.snowflake_node_id=17');
  });

  it('preserves existing PostgreSQL connection options', () => {
    process.env.NODE_ENV = 'test';
    process.env.SNOWFLAKE_NODE_ID = '9';
    process.env.DATABASE_URL =
      'postgresql://user:pass@localhost:5432/app?options=-c%20statement_timeout%3D5000';

    const url = new URL(buildDatabaseUrl());
    expect(url.searchParams.get('options')).toBe(
      '-c statement_timeout=5000 -c app.snowflake_node_id=9',
    );
  });

  it('rejects a missing production node ID', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SNOWFLAKE_NODE_ID;
    expect(() => snowflakeNodeId()).toThrow('Missing required env: SNOWFLAKE_NODE_ID');
  });

  it.each(['-1', '1024', 'abc', '1.5'])('rejects invalid node ID %s', (value) => {
    process.env.SNOWFLAKE_NODE_ID = value;
    expect(() => snowflakeNodeId()).toThrow('Invalid SNOWFLAKE_NODE_ID');
  });
});
