import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useFriendRequestStore } from '../state/friend-request-store';

/** Screens share the app-wide request inbox; focus refresh is an extra catch-up. */
export function useFriendRequests(enabled = true) {
  const requests = useFriendRequestStore((s) => s.requests);
  const error = useFriendRequestStore((s) => s.error);
  const refresh = useFriendRequestStore((s) => s.refresh);
  useFocusEffect(useCallback(() => { if (enabled) void refresh(); }, [enabled, refresh]));
  return { requests, error, refresh };
}
