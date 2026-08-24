/**
 * Auth & Profile Service — identity, profile, App Store C4 EULA acceptance.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export const EULA_CHAT_C4 = 'APP_STORE_C4_CHAT';
export const EULA_MARKETPLACE = 'MARKETPLACE_TERMS';
export const EULA_PRIVACY = 'PRIVACY';

export type ProfilePrivacy = {
  privateAccount?: boolean;
  showFollowers?: boolean;
  whoCanMessage?: 'everyone' | 'followers' | 'nobody';
  whoCanComment?: 'everyone' | 'followers';
};

export type ProfileDto = {
  userId: string;
  displayName?: string | null;
  handle?: string | null;
  role: string;
  shopId?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  email?: string | null;
  privacy?: ProfilePrivacy;
  updatedAt: string;
};

async function database<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'DATABASE_UNAVAILABLE',
      'ไม่สามารถเชื่อมต่อฐานข้อมูลบัญชีได้ กรุณาลองใหม่อีกครั้ง',
      503,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function optionalText(value: string | undefined, field: string, max: number) {
  if (value == null) return;
  const text = value.trim();
  if (!text || text.length > max) {
    throw new AppError('VALIDATION', `${field} ไม่ถูกต้อง`, 400);
  }
}

function optionalPublicUrl(value: string | undefined, field: string) {
  if (value == null) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
  } catch {
    throw new AppError('VALIDATION', `${field} ต้องเป็น URL จากเซิร์ฟเวอร์`, 400);
  }
}

function asPrivacy(value: unknown): ProfilePrivacy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    privateAccount: Boolean(raw.privateAccount),
    showFollowers: raw.showFollowers !== false,
    whoCanMessage:
      raw.whoCanMessage === 'followers' || raw.whoCanMessage === 'nobody'
        ? raw.whoCanMessage
        : 'everyone',
    whoCanComment: raw.whoCanComment === 'followers' ? 'followers' : 'everyone',
  };
}

function mapProfile(row: {
  userId: string;
  displayName: string | null;
  handle: string | null;
  role: string;
  shopId: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  email?: string | null;
  privacyJson?: unknown;
  updatedAt: Date;
}): ProfileDto {
  return {
    userId: row.userId,
    displayName: row.displayName,
    handle: row.handle,
    role: row.role,
    shopId: row.shopId,
    bio: row.bio ?? null,
    avatarUrl: row.avatarUrl ?? null,
    coverUrl: row.coverUrl ?? null,
    email: row.email ?? null,
    privacy: asPrivacy(row.privacyJson),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertProfile(input: {
  userId: string;
  displayName?: string;
  handle?: string;
  role?: string;
  shopId?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  email?: string;
  privacy?: ProfilePrivacy;
  passwordHash?: string;
}): Promise<ProfileDto> {
  if (!input.userId.trim()) throw new AppError('VALIDATION', 'userId required', 400);
  optionalText(input.displayName, 'displayName', 60);
  optionalText(input.handle, 'handle', 32);
  if (input.handle && !/^@?[a-zA-Z0-9_.]+$/.test(input.handle.trim())) {
    throw new AppError('VALIDATION', 'handle ใช้ได้เฉพาะตัวอักษร ตัวเลข จุด และขีดล่าง', 400);
  }
  if (input.bio != null && input.bio.length > 160) {
    throw new AppError('VALIDATION', 'bio ยาวเกิน 160 ตัวอักษร', 400);
  }
  optionalPublicUrl(input.avatarUrl, 'avatarUrl');
  optionalPublicUrl(input.coverUrl, 'coverUrl');

  return database(async () => {
    const existing = await prisma.userProfile.findUnique({ where: { userId: input.userId } });
    const privacyJson = input.privacy
      ? { ...asPrivacy(existing?.privacyJson), ...input.privacy }
      : existing?.privacyJson ?? {};
    const row = await prisma.userProfile.upsert({
      where: { userId: input.userId },
      create: {
        id: randomUUID(),
        userId: input.userId,
        displayName: input.displayName,
        handle: input.handle,
        role: input.role ?? 'BUYER',
        shopId: input.shopId,
        bio: input.bio,
        avatarUrl: input.avatarUrl,
        coverUrl: input.coverUrl,
        email: input.email,
        passwordHash: input.passwordHash,
        privacyJson,
      },
      update: {
        displayName: input.displayName,
        handle: input.handle,
        role: input.role,
        shopId: input.shopId,
        bio: input.bio,
        avatarUrl: input.avatarUrl,
        coverUrl: input.coverUrl,
        email: input.email,
        passwordHash: input.passwordHash,
        privacyJson,
      },
    });
    return mapProfile(row);
  });
}

export async function getProfile(userId: string): Promise<ProfileDto | null> {
  return database(async () => {
    const row = await prisma.userProfile.findUnique({ where: { userId } });
    if (!row) return null;
    return mapProfile(row);
  });
}

export async function getProfileByEmail(email: string): Promise<(ProfileDto & { passwordHash?: string }) | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  return database(async () => {
    const row = await prisma.userProfile.findFirst({
      where: { email: { equals: key, mode: 'insensitive' } },
    });
    if (!row) return null;
    return { ...mapProfile(row), passwordHash: row.passwordHash ?? undefined };
  });
}

export async function acceptEula(input: {
  userId: string;
  policyKey: string;
  version: string;
  ipHint?: string;
  userAgent?: string;
}) {
  if (!input.userId || !input.policyKey || !input.version) {
    throw new AppError('VALIDATION', 'userId, policyKey, version required', 400);
  }
  await upsertProfile({ userId: input.userId });

  return database(async () => {
    const row = await prisma.eulaAcceptance.upsert({
      where: {
        userId_policyKey_version: {
          userId: input.userId,
          policyKey: input.policyKey,
          version: input.version,
        },
      },
      create: {
        id: randomUUID(),
        userId: input.userId,
        policyKey: input.policyKey,
        version: input.version,
        ipHint: input.ipHint,
        userAgent: input.userAgent,
      },
      update: {},
    });
    return {
      userId: row.userId,
      policyKey: row.policyKey,
      version: row.version,
      acceptedAt: row.acceptedAt.toISOString(),
    };
  });
}

export async function hasAcceptedEula(
  userId: string,
  policyKey: string,
  version: string,
): Promise<boolean> {
  return database(async () => {
    const row = await prisma.eulaAcceptance.findUnique({
      where: {
        userId_policyKey_version: { userId, policyKey, version },
      },
    });
    return Boolean(row);
  });
}

export async function listProfiles(limit = 100) {
  const take = Math.min(limit, 300);
  return database(async () => {
    const rows = await prisma.userProfile.findMany({
      orderBy: { updatedAt: 'desc' },
      take,
    });
    return rows.map(mapProfile);
  });
}

export function authDomainStatus() {
  return {
    domain: 'auth-profile',
    eulaPolicies: [EULA_CHAT_C4, EULA_MARKETPLACE, EULA_PRIVACY],
    appleGuideline: '5.1.1 / UGC C4-aligned EULA required before chat',
    auth: 'Apple/Google JWKS + Facebook Graph + phone SMS OTP + email/password (scrypt) + JWT; Admin RBAC via API key',
  };
}
