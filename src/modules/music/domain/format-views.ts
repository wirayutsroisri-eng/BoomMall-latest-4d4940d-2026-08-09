/** TikTok-style compact view counts (Thai-friendly). */
export function formatViewCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  if (v < 10_000) {
    const k = v / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}พัน`;
  }
  if (v < 100_000) {
    const k = v / 10_000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}หมื่น`;
  }
  if (v < 1_000_000) {
    const k = v / 100_000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}แสน`;
  }
  const m = v / 1_000_000;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}ล้าน`;
}

export function formatViewsLabel(n: number): string {
  return `${formatViewCount(n)} วิว`;
}

/** Relative time for watch history rows */
export function formatWatchAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return 'เมื่อสักครู่';
  if (sec < 3600) return `${Math.floor(sec / 60)} นาทีที่แล้ว`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ชม.ที่แล้ว`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} วันที่แล้ว`;
  return `${Math.floor(sec / (86400 * 7))} สัปดาห์ที่แล้ว`;
}
