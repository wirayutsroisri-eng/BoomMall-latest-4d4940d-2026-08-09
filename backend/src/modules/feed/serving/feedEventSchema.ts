/**
 * Feed Serving V2 — event validation.
 *
 * Pure and dependency-free: the ingest route trusts nothing from a client, and a
 * malformed row must be dropped on its own rather than failing a whole batch.
 */

export const FEED_EVENT_TYPES = ['impression', 'watch', 'skip', 'engage'] as const;
export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

export const FEED_ENGAGE_ACTIONS = [
  'like',
  'comment',
  'save',
  'repost',
  'share_chat',
  'share_link',
  'profile',
  'product',
  'mention_tap',
] as const;
export type FeedEngageAction = (typeof FEED_ENGAGE_ACTIONS)[number];

export type NormalizedFeedEvent = {
  itemId: string;
  rootId: string | null;
  itemKind: 'organic' | 'ad';
  slot: number;
  type: FeedEventType;
  action: FeedEngageAction | null;
  watchMs: number;
  videoMs: number;
  dwellMs: number;
  completed: boolean;
  rankToken: string | null;
  configVersion: number | null;
  variant: string | null;
  seq: number;
};

export const MAX_EVENTS_PER_BATCH = 200;
/** A single view longer than this is a stuck timer, not a viewer. */
const MAX_DURATION_MS = 6 * 60 * 60 * 1000;

function str(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function ms(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), MAX_DURATION_MS);
}

function int(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Returns null when the row cannot be trusted — the caller counts it as dropped. */
export function normalizeFeedEvent(input: unknown): NormalizedFeedEvent | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;

  const itemId = str(row.itemId ?? row.postId, 100);
  if (!itemId) return null;

  const type = str(row.type, 20) as FeedEventType | null;
  if (!type || !FEED_EVENT_TYPES.includes(type)) return null;

  const rawAction = str(row.action, 30);
  const action =
    type === 'engage' && rawAction && (FEED_ENGAGE_ACTIONS as readonly string[]).includes(rawAction)
      ? (rawAction as FeedEngageAction)
      : null;
  // An engage row without a known action carries no signal at all.
  if (type === 'engage' && !action) return null;

  const watchMs = ms(row.watchMs);
  const videoMs = ms(row.videoMs);

  return {
    itemId,
    rootId: str(row.rootId ?? row.rootPostId, 100),
    itemKind: row.itemKind === 'ad' ? 'ad' : 'organic',
    slot: int(row.slot, 0, 10_000),
    type,
    action,
    watchMs,
    videoMs,
    dwellMs: ms(row.dwellMs),
    // Trust the client's flag only when the numbers back it up.
    completed: Boolean(row.completed) && (videoMs === 0 || watchMs >= videoMs * 0.9),
    rankToken: str(row.rankToken, 120),
    configVersion:
      row.configVersion == null || !Number.isFinite(Number(row.configVersion))
        ? null
        : int(row.configVersion, 0, 1_000_000),
    variant: str(row.variant, 40),
    seq: int(row.seq, 0, 1_000_000),
  };
}

export function normalizeFeedEventBatch(input: unknown): {
  events: NormalizedFeedEvent[];
  dropped: number;
} {
  if (!Array.isArray(input)) return { events: [], dropped: 0 };
  const capped = input.slice(0, MAX_EVENTS_PER_BATCH);
  const events: NormalizedFeedEvent[] = [];
  let dropped = input.length - capped.length;
  const seen = new Set<string>();
  for (const row of capped) {
    const event = normalizeFeedEvent(row);
    if (!event) {
      dropped += 1;
      continue;
    }
    // The unique key the database enforces — collapse in-batch duplicates first
    // so one retry cannot inflate a post's watch time.
    const key = `${event.itemId}:${event.type}:${event.seq}`;
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    events.push(event);
  }
  return { events, dropped };
}
