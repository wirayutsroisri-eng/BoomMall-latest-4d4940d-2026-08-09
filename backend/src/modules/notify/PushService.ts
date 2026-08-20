import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export type PushDeviceDto = {
  id: string;
  userId: string;
  token: string;
  platform: string;
};

type Store = { devices: PushDeviceDto[] };
const DATA_FILE = path.join(process.cwd(), 'data', 'push-devices.json');

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) return { devices: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Store;
  } catch {
    return { devices: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.pushDevice.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function registerPushDevice(input: {
  userId: string;
  token: string;
  platform?: string;
}): Promise<PushDeviceDto> {
  const token = input.token.trim();
  if (!input.userId || !token) throw new AppError('VALIDATION', 'userId and token required', 400);
  const platform = (input.platform ?? 'ios').toLowerCase();

  if (await prismaReady()) {
    const row = await prisma.pushDevice.upsert({
      where: { token },
      create: { id: randomUUID(), userId: input.userId, token, platform },
      update: { userId: input.userId, platform },
    });
    return { id: row.id, userId: row.userId, token: row.token, platform: row.platform };
  }

  const store = readStore();
  const existing = store.devices.find((d) => d.token === token);
  const row: PushDeviceDto = {
    id: existing?.id ?? randomUUID(),
    userId: input.userId,
    token,
    platform,
  };
  store.devices = [row, ...store.devices.filter((d) => d.token !== token)];
  writeStore(store);
  return row;
}

export async function unregisterPushDevice(token: string) {
  if (await prismaReady()) {
    await prisma.pushDevice.deleteMany({ where: { token } });
    return { ok: true as const };
  }
  const store = readStore();
  store.devices = store.devices.filter((d) => d.token !== token);
  writeStore(store);
  return { ok: true as const };
}

async function tokensForUsers(userIds: string[]) {
  if (!userIds.length) return [];
  if (await prismaReady()) {
    const rows = await prisma.pushDevice.findMany({
      where: { userId: { in: userIds } },
    });
    return rows.map((r) => r.token);
  }
  const set = new Set(userIds);
  return readStore()
    .devices.filter((d) => set.has(d.userId))
    .map((d) => d.token);
}

export async function sendPushToUsers(input: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  const tokens = await tokensForUsers(input.userIds);
  if (!tokens.length) return { sent: 0, skipped: true as const };

  const messages = tokens.map((to) => ({
    to,
    title: input.title,
    body: input.body,
    data: input.data ?? {},
    sound: 'default',
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    return { sent: tokens.length, ok: res.ok };
  } catch {
    return { sent: 0, ok: false };
  }
}

export function pushDomainStatus() {
  return {
    domain: 'push-notifications',
    provider: 'expo-push',
    events: ['chat', 'comment', 'post_follow', 'matching', 'seller'],
  };
}
