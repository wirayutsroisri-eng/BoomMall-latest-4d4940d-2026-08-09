import { BOT_PERSONAS } from '@/modules/chat/data/mockBots';
import { mockFeedsData } from '@/modules/feed/data/mockFeedsData';
import type { SearchResult } from '../domain/types';

/** Deterministic mock Thai mobile number from a seed string, so it stays stable across renders. */
function phoneForSeed(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rest = String(h % 10000000).padStart(7, '0');
  return `08${rest[0]}-${rest.slice(1, 4)}-${rest.slice(4, 7)}`;
}

/** People already chatting with us — Official / Verified accounts (Boom EV Assistant network) */
const OFFICIAL_RESULTS: SearchResult[] = BOT_PERSONAS.map((bot) => ({
  id: bot.id,
  handle: bot.handle.replace(/^@/, ''),
  displayName: bot.name,
  subtitle: bot.role,
  avatarColor: bot.avatarColor,
  kind: 'official',
  verified: true,
  phone: phoneForSeed(bot.handle),
}));

/** Shops / creators discovered from Home Feed content — candidates for [+ เพิ่มเพื่อน] */
const seenHandles = new Set(OFFICIAL_RESULTS.map((r) => r.handle));
const CREATOR_RESULTS: SearchResult[] = [];
for (const item of mockFeedsData) {
  const handle = item.authorHandle.replace(/^@/, '');
  if (seenHandles.has(handle)) continue;
  seenHandles.add(handle);
  CREATOR_RESULTS.push({
    id: `creator-${handle}`,
    handle,
    displayName: item.author,
    subtitle: `${item.product.tier} · ผู้สร้างคอนเทนต์ · ${item.location}`,
    avatarColor: item.gradient[0],
    kind: 'creator',
    phone: phoneForSeed(handle),
  });
}

/** Personal contacts not tied to any shop — live graph only, no simulated people */
const FRIEND_RESULTS: SearchResult[] = [];

export const SEARCH_DIRECTORY: SearchResult[] = [
  ...OFFICIAL_RESULTS,
  ...FRIEND_RESULTS,
  ...CREATOR_RESULTS,
];

function normalizePhone(v: string) {
  return v.replace(/[^0-9]/g, '');
}

/** Extract a bare handle from raw input — supports @handle, IG links, and profile URLs. */
export function extractHandleFromQuery(raw: string): string {
  let q = raw.trim();
  if (!q) return '';
  // instagram.com/username, boommall://friend/username, etc. → take the last path segment
  if (q.includes('/')) {
    const parts = q.split('/').filter(Boolean);
    q = parts[parts.length - 1] ?? q;
  }
  return q.replace(/^@/, '').trim().toLowerCase();
}

/** Matches [ชื่อผู้ใช้ / ID], [ลิงก์ IG (@username)] and [เบอร์โทรศัพท์] against the directory. */
export function searchDirectory(rawQuery: string): SearchResult[] {
  const query = rawQuery.trim();
  if (!query) return SEARCH_DIRECTORY;

  const handleQuery = extractHandleFromQuery(query);
  const digitsQuery = normalizePhone(query);
  const nameQuery = query.toLowerCase();

  return SEARCH_DIRECTORY.filter((result) => {
    if (result.handle.toLowerCase().includes(handleQuery)) return true;
    if (result.displayName.toLowerCase().includes(nameQuery)) return true;
    if (digitsQuery.length >= 3 && result.phone && normalizePhone(result.phone).includes(digitsQuery)) {
      return true;
    }
    return false;
  });
}

/** Resolve an exact QR payload (e.g. `boommall://friend/<handle>` or a bare handle) to a directory entry. */
export function resolveByHandle(rawHandle: string): SearchResult | undefined {
  const handle = extractHandleFromQuery(rawHandle);
  return SEARCH_DIRECTORY.find((r) => r.handle.toLowerCase() === handle);
}
