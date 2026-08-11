/** Sortable unique IDs (ULID-inspired) for Preview/Test. */

let seq = 0;

export function createUlid(now = Date.now()): string {
  seq = (seq + 1) % 1_000_000;
  const t = now.toString(36).padStart(10, '0');
  const r = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  const s = seq.toString(36).padStart(4, '0');
  return `${t}${r}${s}`.toUpperCase();
}

export function createRequestId(): string {
  return `req_${createUlid()}`;
}

export function createIdempotencyKey(prefix = 'idem'): string {
  return `${prefix}_${createUlid()}`;
}
