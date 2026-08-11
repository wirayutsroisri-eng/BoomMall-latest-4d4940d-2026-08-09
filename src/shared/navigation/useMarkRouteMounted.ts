import { useEffect } from 'react';
import { setRouteMounted } from './safeNavigate';

/** Prevents double-push of the same modal/route while it is on screen. */
export function useMarkRouteMounted(route: string) {
  useEffect(() => {
    setRouteMounted(route, true);
    return () => setRouteMounted(route, false);
  }, [route]);
}
