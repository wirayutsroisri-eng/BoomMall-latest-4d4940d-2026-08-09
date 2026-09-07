/**
 * Read-path hardening for catalog media URLs stored in CommerceProduct /
 * CommerceSku payloadJson.
 *
 * The database is the source of truth for media metadata and should store a
 * stable reference (object key or public URL). Local-storage development used
 * to persist full canonical URLs like `http://192.168.x.x:4000/uploads/...`
 * whose host goes stale when the dev machine's DHCP lease changes. This helper
 * re-bases those `/uploads/` URLs onto the *current* configured media base on
 * every read (same policy as the media module), while https/CDN object URLs,
 * `file://` device paths and plain strings pass through untouched.
 *
 * Pure module (no prisma import) so it can be unit-tested in isolation.
 */
import { currentMediaUrl } from '../media/publicMediaUrl';

const OBJECT_LIST_KEYS = ['media', 'specImages', 'usageImages'] as const;
const STRING_LIST_KEYS = ['imageUris', 'gallery'] as const;
const SINGLE_URI_KEYS = [
  'uri',
  'url',
  'imageUri',
  'imageUrl',
  'coverImage',
  'thumbnailUri',
  'thumbnailUrl',
  'canonicalUrl',
  'playbackUrl',
] as const;

function rebaseUri(value: unknown): unknown {
  return typeof value === 'string' ? currentMediaUrl(value) : value;
}

function rebaseObjectItem(item: unknown): unknown {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const row = { ...(item as Record<string, unknown>) };
  let changed = false;
  for (const key of SINGLE_URI_KEYS) {
    if (typeof row[key] === 'string') {
      const next = currentMediaUrl(row[key] as string);
      if (next !== row[key]) {
        row[key] = next;
        changed = true;
      }
    }
  }
  return changed ? row : item;
}

export function rebaseCatalogMedia(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  const row = { ...(payload as Record<string, unknown>) };

  for (const key of OBJECT_LIST_KEYS) {
    const value = row[key];
    if (Array.isArray(value)) row[key] = value.map(rebaseObjectItem);
  }
  for (const key of STRING_LIST_KEYS) {
    const value = row[key];
    if (Array.isArray(value)) row[key] = value.map(rebaseUri);
  }
  for (const key of SINGLE_URI_KEYS) {
    if (typeof row[key] === 'string') row[key] = currentMediaUrl(row[key] as string);
  }
  return row;
}
