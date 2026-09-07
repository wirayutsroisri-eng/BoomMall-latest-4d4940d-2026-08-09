export function parseFriendQr(data: string): string | null {
  try {
    const url = new URL(data.trim());
    if (url.protocol !== 'boommall:' || url.hostname !== 'add-friend' || (url.pathname && url.pathname !== '/')) return null;
    const token = url.searchParams.get('token');
    return token && /^[A-Za-z0-9_-]{40,60}$/.test(token) ? token : null;
  } catch { return null; }
}
