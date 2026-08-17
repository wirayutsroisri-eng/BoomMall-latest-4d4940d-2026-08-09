import { getApiBase } from '@/modules/auth/state/auth-store';

export type LegalDocKey = 'privacy' | 'terms';

function isPublicHttps(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Public URL for App Store Connect and in-app Safari links. Never localhost. */
export function getLegalUrl(doc: LegalDocKey): string {
  const explicit = (
    doc === 'privacy'
      ? process.env.EXPO_PUBLIC_PRIVACY_URL
      : process.env.EXPO_PUBLIC_TERMS_URL
  )?.trim();
  if (explicit && isPublicHttps(explicit)) return explicit.replace(/\/$/, '');

  const base = getApiBase();
  if (base && isPublicHttps(base)) return `${base}/legal/${doc}`;
  return '';
}
