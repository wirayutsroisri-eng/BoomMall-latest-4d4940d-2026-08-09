/**
 * Auth & Profile Service — identity, profile, App Store C4 EULA acceptance.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { currentMediaUrl } from '../media/publicMediaUrl';
import { validateUsername } from './UsernamePolicy';
import { snowflakeIdForApi } from '../../config/snowflake';
import { computeTrust, computeTrusts, DEFAULT_TRUST, type TrustInfo } from '../profile/TrustService';

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
  snowflakeId?: string;
  displayName?: string | null;
  handle?: string | null;
  role: string;
  shopId?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  email?: string | null;
  privacy?: ProfilePrivacy;
  trust?: TrustInfo | null;
  updatedAt: string;
};

async function database<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new AppError('CONFLICT', 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้แล้ว', 409);
    }
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
  snowflakeId?: bigint | null;
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
}, trust: TrustInfo = DEFAULT_TRUST): ProfileDto {
  return {
    userId: row.userId,
    snowflakeId: snowflakeIdForApi(row.snowflakeId),
    displayName: row.displayName,
    handle: row.handle,
    role: row.role,
    shopId: row.shopId,
    bio: row.bio ?? null,
    avatarUrl: currentMediaUrl(row.avatarUrl) ?? null,
    coverUrl: currentMediaUrl(row.coverUrl) ?? null,
    email: row.email ?? null,
    privacy: asPrivacy(row.privacyJson),
    trust,
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
  const handle = input.handle == null ? undefined : validateUsername(input.handle);
  if (input.handle != null && !handle) {
    throw new AppError('VALIDATION', 'ชื่อผู้ใช้ต้องมี 3–24 ตัว และใช้ได้เฉพาะ a-z ตัวเลข จุด และขีดล่าง', 400);
  }
  if (input.bio != null && input.bio.length > 160) {
    throw new AppError('VALIDATION', 'bio ยาวเกิน 160 ตัวอักษร', 400);
  }
  optionalPublicUrl(input.avatarUrl, 'avatarUrl');
  optionalPublicUrl(input.coverUrl, 'coverUrl');

  return database(async () => {
    const existing = await prisma.userProfile.findUnique({ where: { userId: input.userId } });
    if (handle) {
      const owner = await prisma.userProfile.findFirst({
        where: {
          handle: { equals: handle, mode: 'insensitive' },
          userId: { not: input.userId },
        },
        select: { userId: true },
      });
      if (owner) throw new AppError('CONFLICT', 'ชื่อผู้ใช้นี้ถูกใช้แล้ว', 409);
    }
    const privacyJson = input.privacy
      ? { ...asPrivacy(existing?.privacyJson), ...input.privacy }
      : existing?.privacyJson ?? {};
    const row = await prisma.userProfile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        displayName: input.displayName,
        handle,
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
        handle,
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
    return mapProfile(row, await computeTrust(input.userId));
  });
}

export async function getProfile(userId: string): Promise<ProfileDto | null> {
  return database(async () => {
    const row = await prisma.userProfile.findUnique({ where: { userId } });
    if (!row) return null;
    return mapProfile(row, await computeTrust(userId));
  });
}

/**
 * Every authenticated account owns one stable shop id. Existing accounts created
 * before shop ids became mandatory are upgraded once and keep the same UUID.
 */
export async function ensureProfileShopId(
  userId: string,
): Promise<ProfileDto & { shopId: string }> {
  if (!userId.trim()) throw new AppError('VALIDATION', 'userId required', 400);
  return database(async () => {
    const existing = await prisma.userProfile.findUnique({ where: { userId } });
    if (!existing) {
      throw new AppError('ACCOUNT_DATA_MISSING', 'ไม่พบข้อมูลโปรไฟล์ของบัญชี', 409);
    }
    if (existing.shopId) {
      await migrateLegacyMerchantIds(userId, existing.shopId);
      return { ...mapProfile(existing, await computeTrust(userId)), shopId: existing.shopId };
    }

    // updateMany makes concurrent logins safe: only the first request fills it.
    await prisma.userProfile.updateMany({
      where: { userId, shopId: null },
      data: { shopId: randomUUID() },
    });
    const updated = await prisma.userProfile.findUnique({ where: { userId } });
    if (!updated?.shopId) {
      throw new AppError('DATABASE_UNAVAILABLE', 'ไม่สามารถสร้างรหัสร้านค้าได้', 503);
    }
    await migrateLegacyMerchantIds(userId, updated.shopId);
    return { ...mapProfile(updated, await computeTrust(userId)), shopId: updated.shopId };
  });
}

async function migrateLegacyMerchantIds(userId: string, shopId: string) {
  if (userId === shopId) return;
  await prisma.$transaction([
    prisma.commerceProduct.updateMany({ where: { merchantId: userId }, data: { merchantId: shopId } }),
    prisma.commerceOrder.updateMany({ where: { merchantId: userId }, data: { merchantId: shopId } }),
    prisma.catalogItem.updateMany({ where: { merchantId: userId }, data: { merchantId: shopId } }),
  ]);
}

export async function getProfileByEmail(email: string): Promise<(ProfileDto & { passwordHash?: string }) | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  return database(async () => {
    const row = await prisma.userProfile.findFirst({
      where: { email: { equals: key, mode: 'insensitive' } },
    });
    if (!row) return null;
    return { ...mapProfile(row, await computeTrust(row.userId)), passwordHash: row.passwordHash ?? undefined };
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
    const trustMap = await computeTrusts(rows.map((row) => row.userId));
    return rows.map((row) => mapProfile(row, trustMap.get(row.userId) ?? DEFAULT_TRUST));
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
