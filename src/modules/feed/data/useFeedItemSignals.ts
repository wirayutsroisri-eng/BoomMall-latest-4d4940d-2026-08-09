import { useEffect, useRef } from 'react';
import { trackFeedSignal } from './feedEventQueue';

/** Below this a view is a scroll-past, not a watch. */
const SKIP_THRESHOLD_MS = 2000;

/**
 * Emits the viewing signals for one feed item: an impression when it becomes
 * the active card, then a watch or a skip when the viewer moves on.
 *
 * Signals are credited to `rootId` so a reshare's watch time rolls up to the
 * original post instead of scattering across every copy of it.
 */
export function useFeedItemSignals(input: {
  itemId: string;
  rootId?: string | null;
  isActive: boolean;
  /** Clip length in seconds, 0 for photo/text posts. */
  durationSec?: number;
}) {
  const { itemId, rootId, isActive, durationSec = 0 } = input;
  const startedAtRef = useRef(0);
  const durationRef = useRef(durationSec);
  durationRef.current = durationSec;

  useEffect(() => {
    if (isActive) {
      startedAtRef.current = Date.now();
      trackFeedSignal({ itemId, rootId, type: 'impression' });
      return;
    }
    // Also runs on unmount, which is how a card that scrolls out of the
    // window still reports what the viewer saw.
    const startedAt = startedAtRef.current;
    if (!startedAt) return;
    startedAtRef.current = 0;
    const dwellMs = Date.now() - startedAt;
    const videoMs = Math.round(durationRef.current * 1000);
    if (dwellMs < SKIP_THRESHOLD_MS) {
      trackFeedSignal({ itemId, rootId, type: 'skip', dwellMs });
      return;
    }
    trackFeedSignal({
      itemId,
      rootId,
      type: 'watch',
      watchMs: dwellMs,
      videoMs,
      completed: videoMs > 0 && dwellMs >= videoMs * 0.9,
    });
  }, [isActive, itemId, rootId]);
}
