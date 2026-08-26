# Snowflake ID canary

The canonical account primary key remains `UserProfile.userId` (UUID). New
profiles also receive `snowflake_id BIGINT` so the new generator can be measured
without changing existing foreign keys or API contracts.

The additive canary covers `UserProfile` (the canonical users/profile table),
`AuthIdentity`, `SocialPost`, `SocialComment`, and `Story`. UUID primary keys and
all existing foreign keys remain unchanged.

## Configure a node

Each independently deployed writer must use an integer from 0 to 1023.
PostgreSQL cannot read Node.js environment variables directly, so the backend's
`buildDatabaseUrl()` validates `SNOWFLAKE_NODE_ID` and injects it into every
Prisma connection automatically.

```env
SNOWFLAKE_NODE_ID=7
USE_SNOWFLAKE_ID=false
```

When `USE_SNOWFLAKE_ID=true`, API DTOs include `snowflakeId` as a decimal string.
The existing UUID `id`/`userId` fields remain present in both flag states.

For a direct `psql` session:

```sh
PGOPTIONS="-c app.snowflake_node_id=${SNOWFLAKE_NODE_ID}" psql "$DATABASE_URL"
```

For tools that do not use the backend URL builder, add an encoded `options`
parameter per backend instance:

```text
postgresql://user:password@host:5432/database?options=-c%20app.snowflake_node_id%3D7
```

Do not assign node `7` to more than one live generator at the same time.

Set the option on every application and migration connection. The migration
uses node `0` only as a transaction-local fallback while backfilling legacy
rows; that fallback does not remain active for later application sessions.

## Examples

```sql
SET app.snowflake_node_id = '7';

SELECT generate_snowflake_id();

INSERT INTO "UserProfile" ("userId", "displayName")
VALUES ('86bf01f0-d072-43c3-ab21-6ee9c7b85591', 'Canary User')
RETURNING "userId", "snowflake_id";

SELECT "userId", "snowflake_id", "displayName"
FROM "UserProfile"
ORDER BY "snowflake_id" DESC
LIMIT 20;
```

Run the non-destructive SQL smoke test after migration:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/snowflake.smoke.sql
```

Prisma returns `BigInt` values as JavaScript `bigint`. Convert IDs to strings at
the API boundary; never convert a Snowflake ID to JavaScript `number`.

## Rollback during canary

Stop reading `snowflake_id`, then remove its index and column. Keep the UUID
primary key and all existing foreign keys unchanged. The generator function and
state table can be dropped only after no table defaults reference the function.
