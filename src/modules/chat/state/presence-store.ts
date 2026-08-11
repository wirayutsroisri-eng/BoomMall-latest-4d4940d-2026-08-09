import { create } from 'zustand';
import { CURRENT_USER_ID } from '@/modules/chat/data/mockChatData';
import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_ONLINE_TTL_MS,
  PRESENCE_PEER_TICK_MS,
  applyPresenceToNotes,
  collectPeerUserIds,
  isPresenceOnline,
  mergePresenceMaps,
  simulatePeerPresence,
  touchPresence,
  type PresenceRecord,
  type PresenceSurface,
} from '@/modules/chat/data/presenceService';
import { useChatStore } from '@/modules/chat/state/chat-store';

type PresenceState = {
  presenceByUserId: Record<string, PresenceRecord>;
  localSurface: PresenceSurface | null;
  /** refcount — กัน start ซ้ำตอนหลายหน้า mount */
  engineRefCount: number;
  markLocalPresent: (surface: PresenceSurface) => void;
  clearLocalPresent: (surface: PresenceSurface) => void;
  heartbeatLocal: () => void;
  ingestRemotePresence: (records: Record<string, PresenceRecord>) => void;
  startPresenceEngine: () => void;
  stopPresenceEngine: () => void;
};

let peerTimer: ReturnType<typeof setInterval> | null = null;

function pushNotesFromPresence(presenceByUserId: Record<string, PresenceRecord>) {
  const chat = useChatStore.getState();
  const nextNotes = applyPresenceToNotes(chat.notes, presenceByUserId);
  if (nextNotes === chat.notes) return;
  useChatStore.setState({ notes: nextNotes });
  const my = chat.myStatus;
  if (my) {
    const online = isPresenceOnline(presenceByUserId[CURRENT_USER_ID], Date.now(), PRESENCE_ONLINE_TTL_MS);
    if (my.isOnline !== online) {
      useChatStore.setState({ myStatus: { ...my, isOnline: online } });
    }
  }
}

function rebuildWithLocal(
  prev: Record<string, PresenceRecord>,
  localSurface: PresenceSurface | null,
  now = Date.now(),
): Record<string, PresenceRecord> {
  let map = { ...prev };
  if (localSurface) {
    map = touchPresence(map, CURRENT_USER_ID, localSurface, 'local', now);
  } else if (map[CURRENT_USER_ID]?.source === 'local') {
    const { [CURRENT_USER_ID]: _, ...rest } = map;
    map = rest;
  }
  return map;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  presenceByUserId: {},
  localSurface: null,
  engineRefCount: 0,

  markLocalPresent: (surface) => {
    const now = Date.now();
    set((state) => {
      const presenceByUserId = touchPresence(
        state.presenceByUserId,
        CURRENT_USER_ID,
        surface,
        'local',
        now,
      );
      pushNotesFromPresence(presenceByUserId);
      return { localSurface: surface, presenceByUserId };
    });
  },

  clearLocalPresent: (surface) => {
    const { localSurface } = get();
    if (localSurface !== surface) return;
    set((state) => {
      const { [CURRENT_USER_ID]: _, ...rest } = state.presenceByUserId;
      pushNotesFromPresence(rest);
      return { localSurface: null, presenceByUserId: rest };
    });
  },

  heartbeatLocal: () => {
    const { localSurface } = get();
    if (!localSurface) return;
    get().markLocalPresent(localSurface);
  },

  /** จุดต่อ backend จริง — ยิง records จาก WS/API เข้าที่นี่ */
  ingestRemotePresence: (records) => {
    set((state) => {
      const presenceByUserId = mergePresenceMaps(state.presenceByUserId, records);
      const withLocal = rebuildWithLocal(presenceByUserId, state.localSurface);
      pushNotesFromPresence(withLocal);
      return { presenceByUserId: withLocal };
    });
  },

  startPresenceEngine: () => {
    const nextCount = get().engineRefCount + 1;
    set({ engineRefCount: nextCount });
    if (nextCount > 1 && peerTimer) return;

    const tick = () => {
      const notes = useChatStore.getState().notes;
      const peerIds = collectPeerUserIds(notes, CURRENT_USER_ID);
      const peerMap = simulatePeerPresence(peerIds);
      const { localSurface, presenceByUserId } = get();
      const merged = rebuildWithLocal(mergePresenceMaps(presenceByUserId, peerMap), localSurface);
      set({ presenceByUserId: merged });
      pushNotesFromPresence(merged);
    };

    tick();
    peerTimer = setInterval(tick, PRESENCE_PEER_TICK_MS);
  },

  stopPresenceEngine: () => {
    const nextCount = Math.max(0, get().engineRefCount - 1);
    set({ engineRefCount: nextCount });
    if (nextCount === 0 && peerTimer) {
      clearInterval(peerTimer);
      peerTimer = null;
    }
  },
}));

export { PRESENCE_HEARTBEAT_MS };
