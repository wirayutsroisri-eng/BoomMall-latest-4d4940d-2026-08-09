function configuredMediaBase() {
  return (process.env.MEDIA_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || '')
    .trim()
    .replace(/\/$/, '');
}

/** Preserve the stable upload path while adapting development URLs after DHCP changes. */
export function currentMediaUrl(value: string | null | undefined) {
  if (!value) return value;
  const base = configuredMediaBase();
  if (!base) return value;
  try {
    const url = new URL(value);
    if (!url.pathname.startsWith('/uploads/')) return value;
    return `${base}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

export function rewriteMediaUrls<T>(value: T): T {
  if (typeof value === 'string') return currentMediaUrl(value) as T;
  if (Array.isArray(value)) return value.map(rewriteMediaUrls) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, rewriteMediaUrls(item)]),
  ) as T;
}
