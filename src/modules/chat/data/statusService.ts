import type { ActiveNote, MyNote, UserStatus } from '../domain/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build a UserStatus from a short note / photo moment (expires in 24h by default). */
export function createUserStatus(
  userId: string,
  statusNote: string,
  isOnline = true,
  imageUri?: string | null,
): UserStatus {
  const now = new Date();
  return {
    userId,
    statusNote: statusNote.trim(),
    imageUri: imageUri ?? null,
    expiresAt: new Date(now.getTime() + DAY_MS).toISOString(),
    isOnline,
    updatedAt: now.toISOString(),
  };
}

export function isStatusExpired(status: UserStatus, now = Date.now()): boolean {
  if (!status.expiresAt) return false;
  return new Date(status.expiresAt).getTime() <= now;
}

/** Active Notes bar only shows online + non-expired statuses. */
export function filterActiveStatuses(statuses: UserStatus[], now = Date.now()): UserStatus[] {
  return statuses.filter((s) => s.isOnline && !isStatusExpired(s, now));
}

export function userStatusToMyNote(status: UserStatus, emoji = '💭'): MyNote {
  return {
    emoji,
    text: status.statusNote,
    imageUri: status.imageUri ?? undefined,
    postedAt: 'ตอนนี้',
    expiresAt: status.expiresAt,
  };
}

export function activeNoteToUserStatus(note: ActiveNote): UserStatus {
  return {
    userId: note.userId ?? note.id,
    statusNote: note.text,
    imageUri: note.imageUri ?? null,
    expiresAt: note.expiresAt ?? null,
    isOnline: note.isOnline,
    updatedAt: note.postedAt,
  };
}
