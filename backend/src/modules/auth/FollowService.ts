import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export type FollowDto = {
  id: string;
  followerId: string;
  followingId: string;
  followingHandle: string;
  createdAt: string;
};

type Store = { follows: FollowDto[] };
const DATA_FILE = path.join(process.cwd(), 'data', 'follows.json');

function normalizeHandle(handle: string) {
  return handle.replace(/^@/, '').trim().toLowerCase();
}

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) return { follows: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Store;
  } catch {
    return { follows: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.follow.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

async function resolveFollowing(handleOrId: string) {
  const handle = normalizeHandle(handleOrId);
  if (!handle) throw new AppError('VALIDATION', 'handle required', 400);
  try {
    const profile = await prisma.userProfile.findFirst({
      where: {
        OR: [{ handle: { equals: handle, mode: 'insensitive' } }, { userId: handleOrId }],
      },
    });
    if (profile) {
      return {
        followingId: profile.userId,
        followingHandle: normalizeHandle(profile.handle ?? handle),
      };
    }
  } catch {
    /* table may be unavailable */
  }
  return { followingId: `handle:${handle}`, followingHandle: handle };
}

export async function followUser(followerId: string, handleOrId: string): Promise<FollowDto> {
  if (!followerId) throw new AppError('VALIDATION', 'followerId required', 400);
  const target = await resolveFollowing(handleOrId);
  if (target.followingId === followerId) {
    throw new AppError('VALIDATION', 'cannot follow yourself', 400);
  }

  if (await prismaReady()) {
    const row = await prisma.follow.upsert({
      where: {
        followerId_followingId: { followerId, followingId: target.followingId },
      },
      create: {
        id: randomUUID(),
        followerId,
        followingId: target.followingId,
        followingHandle: target.followingHandle,
      },
      update: { followingHandle: target.followingHandle },
    });
    return {
      id: row.id,
      followerId: row.followerId,
      followingId: row.followingId,
      followingHandle: row.followingHandle,
      createdAt: row.createdAt.toISOString(),
    };
  }

  const store = readStore();
  const existing = store.follows.find(
    (f) => f.followerId === followerId && f.followingId === target.followingId,
  );
  if (existing) return existing;
  const row: FollowDto = {
    id: randomUUID(),
    followerId,
    followingId: target.followingId,
    followingHandle: target.followingHandle,
    createdAt: new Date().toISOString(),
  };
  store.follows.unshift(row);
  writeStore(store);
  return row;
}

export async function unfollowUser(followerId: string, handleOrId: string) {
  const target = await resolveFollowing(handleOrId);
  if (await prismaReady()) {
    await prisma.follow.deleteMany({
      where: {
        followerId,
        OR: [{ followingId: target.followingId }, { followingHandle: target.followingHandle }],
      },
    });
    return { ok: true as const };
  }
  const store = readStore();
  store.follows = store.follows.filter(
    (f) =>
      !(
        f.followerId === followerId &&
        (f.followingId === target.followingId || f.followingHandle === target.followingHandle)
      ),
  );
  writeStore(store);
  return { ok: true as const };
}

export async function listFollowing(followerId: string): Promise<FollowDto[]> {
  if (await prismaReady()) {
    const rows = await prisma.follow.findMany({
      where: { followerId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      followerId: row.followerId,
      followingId: row.followingId,
      followingHandle: row.followingHandle,
      createdAt: row.createdAt.toISOString(),
    }));
  }
  return readStore().follows.filter((f) => f.followerId === followerId);
}

export async function listFollowers(followingId: string): Promise<FollowDto[]> {
  const handle = normalizeHandle(followingId);
  if (await prismaReady()) {
    const rows = await prisma.follow.findMany({
      where: {
        OR: [{ followingId }, { followingHandle: handle }],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      followerId: row.followerId,
      followingId: row.followingId,
      followingHandle: row.followingHandle,
      createdAt: row.createdAt.toISOString(),
    }));
  }
  return readStore().follows.filter(
    (f) => f.followingId === followingId || f.followingHandle === handle,
  );
}

export async function followCounts(userId: string) {
  const [following, followers] = await Promise.all([listFollowing(userId), listFollowers(userId)]);
  return { following: following.length, followers: followers.length };
}
