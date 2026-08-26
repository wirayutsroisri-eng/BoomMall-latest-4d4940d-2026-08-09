export function useSnowflakeId(): boolean {
  const value = process.env.USE_SNOWFLAKE_ID?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

export function snowflakeIdForApi(value: bigint | null | undefined): string | undefined {
  return useSnowflakeId() && value != null ? value.toString() : undefined;
}
