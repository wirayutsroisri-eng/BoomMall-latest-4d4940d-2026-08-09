/**
 * Auth & Profile Service — identity, profile, App Store C4 EULA acceptance.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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

type Store = {
  profiles: ProfileDto[];
  eula: Array<{
    userId: string;
    policyKey: string;
    version: string;
    acceptedAt: string;
  }>;
};

const DATA_FILE = path.join(process.cwd(), 'data', 'auth-profile.json');

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) return { profiles: [], eula: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Store;
  } catch {
    return { profiles: [], eula: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.userProfile.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
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

  if (await prismaReady()) {
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
  }

  const store = readStore();
  const existing = store.profiles.find((p) => p.userId === input.userId);
  const row: ProfileDto = {
    userId: input.userId,
    displayName: input.displayName ?? existing?.displayName,
    handle: input.handle ?? existing?.handle,
    role: input.role ?? existing?.role ?? 'BUYER',
    shopId: input.shopId ?? existing?.shopId,
    bio: input.bio ?? existing?.bio,
    avatarUrl: input.avatarUrl ?? existing?.avatarUrl,
    coverUrl: input.coverUrl ?? existing?.coverUrl,
    email: input.email ?? existing?.email,
    privacy: { ...asPrivacy(existing?.privacy), ...input.privacy },
    updatedAt: new Date().toISOString(),
  };
  store.profiles = [row, ...store.profiles.filter((p) => p.userId !== input.userId)];
  writeStore(store);
  return row;
}

export async function getProfile(userId: string): Promise<ProfileDto | null> {
  if (await prismaReady()) {
    const row = await prisma.userProfile.findUnique({ where: { userId } });
    if (!row) return null;
    return mapProfile(row);
  }
  return readStore().profiles.find((p) => p.userId === userId) ?? null;
}

export async function getProfileByEmail(email: string): Promise<(ProfileDto & { passwordHash?: string }) | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  if (await prismaReady()) {
    const row = await prisma.userProfile.findFirst({
      where: { email: { equals: key, mode: 'insensitive' } },
    });
    if (!row) return null;
    return { ...mapProfile(row), passwordHash: row.passwordHash ?? undefined };
  }
  return readStore().profiles.find((p) => (p.email ?? '').toLowerCase() === key) ?? null;
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

  if (await prismaReady()) {
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
  }

  const store = readStore();
  const hit = store.eula.find(
    (e) =>
      e.userId === input.userId &&
      e.policyKey === input.policyKey &&
      e.version === input.version,
  );
  if (hit) return hit;
  const row = {
    userId: input.userId,
    policyKey: input.policyKey,
    version: input.version,
    acceptedAt: new Date().toISOString(),
  };
  store.eula.unshift(row);
  writeStore(store);
  return row;
}

export async function hasAcceptedEula(
  userId: string,
  policyKey: string,
  version: string,
): Promise<boolean> {
  if (await prismaReady()) {
    const row = await prisma.eulaAcceptance.findUnique({
      where: {
        userId_policyKey_version: { userId, policyKey, version },
      },
    });
    return Boolean(row);
  }
  return readStore().eula.some(
    (e) => e.userId === userId && e.policyKey === policyKey && e.version === version,
  );
}

export async function listProfiles(limit = 100) {
  const take = Math.min(limit, 300);
  if (await prismaReady()) {
    const rows = await prisma.userProfile.findMany({
      orderBy: { updatedAt: 'desc' },
      take,
    });
    return rows.map(mapProfile);
  }
  return readStore().profiles.slice(0, take);
}

export function authDomainStatus() {
  return {
    domain: 'auth-profile',
    eulaPolicies: [EULA_CHAT_C4, EULA_MARKETPLACE, EULA_PRIVACY],
    appleGuideline: '5.1.1 / UGC C4-aligned EULA required before chat',
    auth: 'Apple/Google JWKS + Facebook Graph + email/password (scrypt) + JWT; Admin RBAC via API key',
  };
}
