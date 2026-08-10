import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useFeedStore } from '@/modules/feed/state/feed-store';

/**
 * Deep-link / legacy-route shim: `boommall://creator/<handle>` now opens the Visitor
 * Profile as a draggable bottom sheet over the Home Feed (see HomeFeedScreen +
 * CreatorProfileSheet) instead of a full page-sheet route. This screen just forwards
 * the request into global state and redirects to the Home tab.
 */
export default function CreatorProfileRoute() {
  const { handle, feedId } = useLocalSearchParams<{ handle: string; feedId?: string }>();

  useEffect(() => {
    if (handle) {
      useFeedStore
        .getState()
        .openCreatorProfile(handle, typeof feedId === 'string' ? feedId : undefined);
    }
    if (router.canDismiss()) {
      router.dismiss();
    } else {
      router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
