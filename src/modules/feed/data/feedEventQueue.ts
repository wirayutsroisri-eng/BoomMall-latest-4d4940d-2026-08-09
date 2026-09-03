import { AppState, type AppStateStatus } from 'react-native';
import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';

/**
 * Feed Serving V2 — outbound signal queue.
 *
 * Watch/impression/skip rows are batched and flushed on a timer so scrolling a
 * feed never waits on the network. Everything here fails silently: a dropped
 * batch costs ranking accuracy, never a broken screen.
 */

export type FeedSignal = {
  itemId: string;
  rootId?: string | null;
  itemKind?: 'organic' | 'ad';
  slot?: number;
  type: 'impression' | 'watch' | 'skip' | 'engage';
  action?:
    | 'like'
    | 'comment'
    | 'save'
    | 'repost'
    | 'share_chat'
    | 'share_link'
    | 'profile'
    | 'product'
    | 'mention_tap';
  watchMs?: number;
  videoMs?: number;
  dwellMs?: number;
  completed?: boolean;
  rankToken?: string | null;
};

const FLUSH_INTERVAL_MS = 10_000;
/** Beyond this the oldest rows are dropped — a queue is not storage. */
const MAX_QUEUED = 500;

let sessionId = createSessionId();
let queue: Array<FeedSignal & { seq: number }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let seqCounter = 0;
let appStateSub: { remove: () => void } | null = null;

function createSessionId(): string {
  return `fs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** The session is the unit the backend groups signals by — one feed visit. */
export function currentFeedSessionId(): string {
  return sessionId;
}

/** Called when the backend hands back its own session id (V2 serving). */
export function adoptFeedSessionId(next: string | undefined | null) {
  const trimmed = next?.trim();
  if (!trimmed || trimmed === sessionId) return;
  void flushFeedSignals();
  sessionId = trimmed;
  seqCounter = 0;
}

export function resetFeedSession() {
  void flushFeedSignals();
  sessionId = createSessionId();
  seqCounter = 0;
}

function ensureTimer() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushFeedSignals();
  }, FLUSH_INTERVAL_MS);
}

function ensureAppStateListener() {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener('change', (status: AppStateStatus) => {
    // Leaving the app is the last chance to send what the viewer just watched.
    if (status !== 'active') void flushFeedSignals();
  });
}

export function trackFeedSignal(signal: FeedSignal) {
  if (!signal.itemId) return;
  seqCounter += 1;
  queue.push({ ...signal, seq: seqCounter });
  if (queue.length > MAX_QUEUED) queue = queue.slice(-MAX_QUEUED);
  ensureAppStateListener();
  ensureTimer();
}

export async function flushFeedSignals(): Promise<boolean> {
  if (flushing || !queue.length) return false;
  const base = getApiBase();
  if (!base) {
    // No backend configured (offline dev): drop rather than grow unbounded.
    queue = [];
    return false;
  }
  const batch = queue;
  const batchSession = sessionId;
  queue = [];
  flushing = true;
  try {
    const res = await fetch(`${base}/api/v1/feed/events`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ feedSessionId: batchSession, events: batch }),
    });
    // 4xx means the batch is malformed or the feature is off — never retry it.
    if (!res.ok && res.status >= 500) queue = [...batch, ...queue].slice(-MAX_QUEUED);
    return res.ok;
  } catch {
    // Offline: keep the newest rows for the next flush.
    queue = [...batch, ...queue].slice(-MAX_QUEUED);
    return false;
  } finally {
    flushing = false;
    if (queue.length) ensureTimer();
  }
}
