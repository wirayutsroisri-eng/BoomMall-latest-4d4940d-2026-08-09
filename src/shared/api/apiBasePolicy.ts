/**
 * Explicit HTTPS API origins are authoritative in every runtime, including
 * Expo Go. Development host discovery is only for local HTTP workflows.
 */
export function shouldUseConfiguredApiUrl(rawUrl: string, pinHost: boolean): boolean {
  if (pinHost) return true;

  try {
    return new URL(rawUrl).protocol === 'https:';
  } catch {
    return false;
  }
}
