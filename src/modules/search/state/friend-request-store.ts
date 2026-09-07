import { create } from 'zustand';
import { listFriendRequests, respondFriendRequest, type FriendRequestRow } from '../data/friendApi';
import { useChatStore } from '@/modules/chat/state/chat-store';

type State = {
  session: string | null;
  requests: FriendRequestRow[];
  error: string | null;
  dismissed: string[];
  bind: (session: string | null) => void;
  refresh: () => Promise<void>;
  dismiss: (id: string) => void;
  respond: (id: string, action: 'accept' | 'reject') => ReturnType<typeof respondFriendRequest>;
};
let revision = 0;
let inFlight: Promise<void> | null = null;

/** One authoritative inbox for banners and every request screen, scoped to the signed-in session. */
export const useFriendRequestStore = create<State>((set, get) => ({
  session: null, requests: [], error: null, dismissed: [],
  bind: (session) => {
    if (get().session === session) return;
    revision += 1; inFlight = null;
    set({ session, requests: [], error: null, dismissed: [] });
  },
  dismiss: (id) => set({ dismissed: [...get().dismissed, id] }),
  refresh: () => {
    if (!get().session) return Promise.resolve();
    if (inFlight) return inFlight;
    const version = revision;
    const work = (async () => {
      try {
        const rows = await listFriendRequests();
        if (version !== revision) return;
        const oldAccepted = new Set(get().requests.filter((r) => r.status === 'ACCEPTED').map((r) => r.id));
        set({ requests: rows, error: null });
        if (rows.some((r) => r.status === 'ACCEPTED' && !oldAccepted.has(r.id))) void useChatStore.getState().hydrateInbox();
      } catch (e) {
        if (version === revision) set({ error: e instanceof Error ? e.message : 'โหลดคำขอไม่สำเร็จ' });
      }
    })();
    inFlight = work;
    void work.finally(() => { if (inFlight === work) inFlight = null; });
    return work;
  },
  respond: async (id, action) => {
    const session = get().session;
    if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
    const result = await respondFriendRequest(id, action);
    if (get().session !== session) throw new Error('บัญชีเปลี่ยนแล้ว กรุณาเปิดรายการคำขออีกครั้ง');
    // Ignore any GET started before this mutation so it cannot restore a handled request.
    revision += 1; inFlight = null;
    set({ requests: get().requests.map((r) => r.id === id ? { ...r, status: result.status } : r), error: null });
    if (action === 'accept') void useChatStore.getState().hydrateInbox();
    void get().refresh();
    return result;
  },
}));
