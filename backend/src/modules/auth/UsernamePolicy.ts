const USERNAME_MAX = 24;

/** Canonical username stored by the backend (without the visual @ prefix). */
export function normalizeUsername(value: string) {
  return value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .slice(0, USERNAME_MAX);
}

/**
 * Privacy-safe initial username. It never exposes an email address, phone
 * number, social-provider id, or product branding.
 */
export function createDefaultUsername(userId: string) {
  const opaque = userId.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `user_${opaque.slice(0, 12) || 'new'}`;
}

export function validateUsername(value: string) {
  const normalized = normalizeUsername(value);
  if (normalized.length < 3) return null;
  if (normalized !== value.trim().replace(/^@+/, '').toLowerCase()) return null;
  if (!/^[a-z0-9][a-z0-9._]*[a-z0-9]$/.test(normalized)) return null;
  return normalized;
}
