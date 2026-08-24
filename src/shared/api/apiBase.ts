import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { shouldUseConfiguredApiUrl } from './apiBasePolicy';

const DEFAULT_PORT = '4000';

function stripSlash(url: string) {
  return url.replace(/\/$/, '');
}

function isLoopbackHost(host: string) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
}

function hostFromMaybeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  try {
    const withProto = trimmed.includes('://') ? trimmed : `http://${trimmed}`;
    const host = new URL(withProto).hostname;
    if (host && !isLoopbackHost(host)) return host;
  } catch {
    const host = trimmed.replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0];
    if (host && !isLoopbackHost(host)) return host;
  }
  return null;
}

/** Metro / Expo packager host on a physical device is the Mac LAN IP — never localhost. */
export function lanDevHost(): string | null {
  const fromEnv = hostFromMaybeUrl(process.env.EXPO_PUBLIC_DEV_API_HOST);
  if (fromEnv) return fromEnv;

  const extra = Constants.expoConfig?.extra as { devApiHost?: string } | undefined;
  const fromExtra = hostFromMaybeUrl(extra?.devApiHost);
  if (fromExtra) return fromExtra;

  const candidates: Array<string | undefined> = [
    Constants.expoGoConfig?.debuggerHost,
    Constants.expoConfig?.hostUri,
    Constants.linkingUri,
    NativeModules.SourceCode?.scriptURL as string | undefined,
  ];
  for (const raw of candidates) {
    const host = hostFromMaybeUrl(raw);
    if (host) return host;
  }
  return null;
}

/**
 * Public API origin for the native app.
 * On a physical iPhone with Metro, always use the Mac LAN IP (never localhost).
 */
export function resolveApiBase(): string {
  const port = process.env.EXPO_PUBLIC_API_PORT?.trim() || DEFAULT_PORT;
  const extra = Constants.expoConfig?.extra as { apiUrl?: string; devApiHost?: string } | undefined;
  const pinHost = process.env.EXPO_PUBLIC_PIN_API_HOST === '1';
  const fromEnv = (
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    extra?.apiUrl ||
    ''
  ).trim();

  if (
    !shouldUseConfiguredApiUrl(fromEnv, pinHost) &&
    Platform.OS !== 'web' &&
    typeof __DEV__ !== 'undefined' &&
    __DEV__
  ) {
    const lan = lanDevHost();
    if (lan) {
      if (fromEnv) {
        try {
          const url = new URL(fromEnv);
          url.hostname = lan;
          if (!url.port) url.port = port;
          return stripSlash(url.toString());
        } catch {
          return `http://${lan}:${port}`;
        }
      }
      return `http://${lan}:${port}`;
    }
  }

  if (fromEnv) {
    try {
      const url = new URL(fromEnv);
      if (isLoopbackHost(url.hostname) && Platform.OS !== 'web') {
        const lan = lanDevHost();
        if (lan) {
          url.hostname = lan;
          return stripSlash(url.toString());
        }
      }
      return stripSlash(fromEnv);
    } catch {
      return stripSlash(fromEnv);
    }
  }

  return '';
}

export function mapNetworkError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (
    /network request failed|fetch failed|failed to fetch|could not connect|timed out|timeout|internet connection appears to be offline|the request timed out|load failed/i.test(
      raw,
    )
  ) {
    const base = resolveApiBase();
    return new Error(
      `ต่อเซิร์ฟเวอร์ไม่ได้${base ? ` (${base})` : ''} — ตรวจว่า iPhone กับคอมพิวเตอร์อยู่ Wi‑Fi เดียวกัน, API เปิดที่พอร์ต 4000 และ EXPO_PUBLIC_API_URL ไม่ใช่ localhost บนเครื่องจริง`,
    );
  }
  return err instanceof Error ? err : new Error(raw || 'ไม่สำเร็จ');
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw mapNetworkError(new Error('timed out'));
    }
    throw mapNetworkError(err);
  } finally {
    clearTimeout(timer);
  }
}
