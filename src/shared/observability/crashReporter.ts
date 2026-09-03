import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';

/**
 * Crash + error reporting without a native SDK.
 *
 * A TestFlight build must be able to say where it broke. This hooks React
 * Native's global error handler and unhandled promise rejections, then posts a
 * trimmed report to the backend. It never throws and never blocks the UI.
 */

let installed = false;
let lastSignature = '';
let lastSentAt = 0;
const sessionId = `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Same error firing in a loop must not become a network loop. */
const DEDUPE_WINDOW_MS = 30_000;

type ErrorUtilsLike = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

function appVersion(): string {
  return String(Constants.expoConfig?.version ?? '');
}

function buildNumber(): string {
  const ios = Constants.expoConfig?.ios?.buildNumber;
  const android = Constants.expoConfig?.android?.versionCode;
  return String(ios ?? android ?? '');
}

export async function reportError(error: unknown, options?: { fatal?: boolean; screen?: string }) {
  try {
    const base = getApiBase();
    if (!base) return;

    const err = error instanceof Error ? error : new Error(String(error));
    const signature = `${err.name}:${err.message}`;
    const now = Date.now();
    if (signature === lastSignature && now - lastSentAt < DEDUPE_WINDOW_MS) return;
    lastSignature = signature;
    lastSentAt = now;

    await fetch(`${base}/api/v1/client-errors`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        message: `${err.name}: ${err.message}`,
        stack: err.stack ?? '',
        fatal: Boolean(options?.fatal),
        screen: options?.screen ?? '',
        platform: Platform.OS,
        appVersion: appVersion(),
        buildNumber: buildNumber(),
        sessionId,
      }),
    }).catch(() => undefined);
  } catch {
    // Reporting a crash must never cause one.
  }
}

export function installCrashReporter() {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  const previous = errorUtils?.getGlobalHandler?.();
  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    void reportError(error, { fatal: Boolean(isFatal) });
    // Keep the platform's own handling: red box in dev, crash in production.
    previous?.(error, isFatal);
  });

  // Hermes surfaces unhandled rejections through this global hook.
  const tracking = (globalThis as {
    HermesInternal?: unknown;
    process?: { on?: (event: string, cb: (reason: unknown) => void) => void };
  }).process;
  tracking?.on?.('unhandledRejection', (reason: unknown) => {
    void reportError(reason, { fatal: false });
  });
}
