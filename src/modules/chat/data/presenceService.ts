import type { ActiveNote } from '../domain/types';

/** พื้นผิวที่นับว่า "กำลังใช้งาน" → ออนไลน์ */
export type PresenceSurface = 'feed' | 'chat';

export type PresenceSource = 'local' | 'peer' | 'remote';

export type PresenceRecord = {
  userId: string;
  /** epoch ms ของ heartbeat ล่าสุด */
  lastSeenAt: number;
  surface: PresenceSurface | null;
  source: PresenceSource;
};

/**
 * ไม่มี heartbeat ภายใน TTL → ถือว่าออฟไลน์
 * ค่านี้ใช้ได้ทั้ง mock และ backend (server ควรใช้ TTL ใกล้เคียงกัน)
 */
export const PRESENCE_ONLINE_TTL_MS = 60_000;

/** ช่วงที่ client ยิง heartbeat ตอนโฟกัสฟีด/แชต */
export const PRESENCE_HEARTBEAT_MS = 12_000;

/** ความถี่ที่จำลอง peer / poll แผนที่ presence */
export const PRESENCE_PEER_TICK_MS = 5_000;

/** อนาคต: แทนที่ mock simulator ด้วย WebSocket / API */
export type PresenceTransport = {
  publish: (userId: string, surface: PresenceSurface | null) => void;
  subscribe: (onUpdate: (records: Record<string, PresenceRecord>) => void) => () => void;
};

export function resolveNoteUserId(note: ActiveNote): string {
  return note.userId ?? `peer:${note.conversationId}`;
}

export function isPresenceOnline(
  record: PresenceRecord | undefined,
  now = Date.now(),
  ttlMs = PRESENCE_ONLINE_TTL_MS,
): boolean {
  if (!record) return false;
  return now - record.lastSeenAt <= ttlMs;
}

export function touchPresence(
  map: Record<string, PresenceRecord>,
  userId: string,
  surface: PresenceSurface | null,
  source: PresenceSource,
  now = Date.now(),
): Record<string, PresenceRecord> {
  return {
    ...map,
    [userId]: {
      userId,
      lastSeenAt: now,
      surface,
      source,
    },
  };
}

/** รวมแผนที่ — local ทับ peer/remote ของ user เดียวกัน */
export function mergePresenceMaps(
  base: Record<string, PresenceRecord>,
  overlay: Record<string, PresenceRecord>,
): Record<string, PresenceRecord> {
  const next = { ...base };
  for (const [userId, record] of Object.entries(overlay)) {
    const prev = next[userId];
    if (prev?.source === 'local' && record.source !== 'local') continue;
    next[userId] = record;
  }
  return next;
}

/**
 * อัปเดต ActiveNote.isOnline จาก presence map
 * (ไม่ลบโน้ต — UI กรองคนออฟไลน์เอง)
 */
export function applyPresenceToNotes(
  notes: ActiveNote[],
  presenceByUserId: Record<string, PresenceRecord>,
  now = Date.now(),
  ttlMs = PRESENCE_ONLINE_TTL_MS,
): ActiveNote[] {
  let changed = false;
  const next = notes.map((note) => {
    const userId = resolveNoteUserId(note);
    const online = isPresenceOnline(presenceByUserId[userId], now, ttlMs);
    if (note.isOnline === online) return note;
    changed = true;
    return { ...note, isOnline: online };
  });
  return changed ? next : notes;
}

/** โมเมนต์ที่ควรโชว์ในแถบ: ออนไลน์ + ยังไม่หมดอายุคอนเทนต์ */
export function filterVisibleMomentNotes(notes: ActiveNote[], now = Date.now()): ActiveNote[] {
  return notes.filter((note) => {
    if (!note.isOnline) return false;
    if (note.expiresAt && new Date(note.expiresAt).getTime() <= now) return false;
    return Boolean(note.imageUri || note.text);
  });
}

/** hash คงที่ 0..1 จาก seed + bucket — ใช้จำลอง duty cycle ให้ทำซ้ำได้ */
function hash01(seed: string, bucket: number): number {
  let h = bucket >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * จำลอง peer ว่าอยู่ฟีด/แชตเป็นรอบๆ (duty cycle)
 * — ออนไลน์ช่วงหนึ่ง / ออฟไลน์ช่วงหนึ่ง ตาม userId
 * เปลี่ยนเป็น PresenceTransport.subscribe จากเซิร์ฟเวอร์ได้โดยไม่แตะ UI
 */
export function simulatePeerPresence(
  peerUserIds: string[],
  now = Date.now(),
  ttlMs = PRESENCE_ONLINE_TTL_MS,
): Record<string, PresenceRecord> {
  const out: Record<string, PresenceRecord> = {};
  for (const userId of peerUserIds) {
    const onlineMs = 45_000 + Math.floor(hash01(userId, 1) * 75_000); // 45–120s
    const offlineMs = 25_000 + Math.floor(hash01(userId, 2) * 70_000); // 25–95s
    const cycle = onlineMs + offlineMs;
    const phase = Math.floor(hash01(userId, 3) * cycle);
    const t = (now + phase) % cycle;
    const online = t < onlineMs;
    if (online) {
      const surface: PresenceSurface = hash01(userId, 4 + Math.floor(now / cycle)) >= 0.42 ? 'feed' : 'chat';
      out[userId] = {
        userId,
        lastSeenAt: now,
        surface,
        source: 'peer',
      };
    } else {
      out[userId] = {
        userId,
        lastSeenAt: now - ttlMs - 1,
        surface: null,
        source: 'peer',
      };
    }
  }
  return out;
}

export function collectPeerUserIds(notes: ActiveNote[], localUserId: string): string[] {
  const ids = new Set<string>();
  for (const note of notes) {
    const id = resolveNoteUserId(note);
    if (id && id !== localUserId) ids.add(id);
  }
  return [...ids];
}
