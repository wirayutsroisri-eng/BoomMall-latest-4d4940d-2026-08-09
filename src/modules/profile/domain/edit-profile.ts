const DAY_MS = 7 * 24 * 60 * 60 * 1000;

export type ProfileEditField = 'name' | 'username' | 'bio' | 'link';

export const PROFILE_FIELD_LIMITS: Record<ProfileEditField, number> = {
  name: 30,
  username: 24,
  bio: 80,
  link: 100,
};

export function stripHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
}

export function formatHandle(raw: string) {
  const cleaned = stripHandle(raw)
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, PROFILE_FIELD_LIMITS.username);
  return cleaned ? `@${cleaned}` : '@';
}

export function profilePublicLink(handle: string) {
  return `boommall.app/@${stripHandle(handle)}`;
}

export function cooldownUntil(changedAt?: string | null) {
  if (!changedAt) return null;
  const at = Date.parse(changedAt);
  if (!Number.isFinite(at)) return null;
  const until = at + DAY_MS;
  return until > Date.now() ? until : null;
}

export function formatCooldownDate(untilMs: number) {
  return new Date(untilMs).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function normalizeWebsite(raw: string) {
  const value = raw.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}
