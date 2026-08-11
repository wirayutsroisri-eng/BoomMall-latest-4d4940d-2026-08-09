import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePresenceStore, PRESENCE_HEARTBEAT_MS } from '@/modules/chat/state/presence-store';
import type { PresenceSurface } from '@/modules/chat/data/presenceService';

/**
 * ผูกสถานะออนไลน์ของ "เรา" กับหน้าจอที่โฟกัสอยู่
 * - feed: กำลังดูคลิปในฟีด
 * - chat: อยู่ในห้องแชต
 * พื้นหลังแอป / ออกจากหน้า → หยุด heartbeat (ออฟไลน์หลัง TTL)
 */
export function usePresenceSession(surface: PresenceSurface, enabled: boolean) {
  const markLocalPresent = usePresenceStore((s) => s.markLocalPresent);
  const clearLocalPresent = usePresenceStore((s) => s.clearLocalPresent);
  const heartbeatLocal = usePresenceStore((s) => s.heartbeatLocal);
  const startPresenceEngine = usePresenceStore((s) => s.startPresenceEngine);
  const stopPresenceEngine = usePresenceStore((s) => s.stopPresenceEngine);

  useEffect(() => {
    startPresenceEngine();
    return () => stopPresenceEngine();
  }, [startPresenceEngine, stopPresenceEngine]);

  useEffect(() => {
    if (!enabled) {
      clearLocalPresent(surface);
      return;
    }

    markLocalPresent(surface);
    const beat = setInterval(() => heartbeatLocal(), PRESENCE_HEARTBEAT_MS);

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') markLocalPresent(surface);
      else clearLocalPresent(surface);
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      clearInterval(beat);
      sub.remove();
      clearLocalPresent(surface);
    };
  }, [
    surface,
    enabled,
    markLocalPresent,
    clearLocalPresent,
    heartbeatLocal,
  ]);
}
