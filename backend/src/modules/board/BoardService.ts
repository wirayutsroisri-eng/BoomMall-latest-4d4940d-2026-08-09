import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export type BoardCategoryDto = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  sortOrder: number;
};

export type BoardThreadDto = {
  id: string;
  categoryId: string;
  authorId: string;
  title: string;
  body: string;
  pinned: boolean;
  score: number;
  replyCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type BoardReplyDto = {
  id: string;
  threadId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  score: number;
  createdAt: string;
};

const SEED_CATEGORIES: BoardCategoryDto[] = [
  { id: 'board-cat-general', slug: 'general', title: 'ทั่วไป', description: 'พูดคุยเรื่องทั่วไปของชุมชน', sortOrder: 0 },
  { id: 'board-cat-trade', slug: 'trade', title: 'ซื้อขาย', description: 'ประกาศซื้อ ขาย แลกเปลี่ยน', sortOrder: 1 },
  { id: 'board-cat-jobs', slug: 'jobs', title: 'ช่าง / บริการ', description: 'หาช่าง รับงาน บริการในพื้นที่', sortOrder: 2 },
  { id: 'board-cat-qa', slug: 'qa', title: 'คำถาม', description: 'ถาม-ตอบ เคล็ดลับ และช่วยเหลือ', sortOrder: 3 },
];

type Store = {
  categories: BoardCategoryDto[];
  threads: BoardThreadDto[];
  replies: BoardReplyDto[];
  votes: Array<{ userId: string; targetType: string; targetId: string; value: number }>;
};

const DATA_FILE = path.join(process.cwd(), 'data', 'board-forum.json');

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { categories: SEED_CATEGORIES, threads: [], replies: [], votes: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Store;
    if (!parsed.categories?.length) parsed.categories = SEED_CATEGORIES;
    parsed.replies ??= [];
    parsed.votes ??= [];
    parsed.threads ??= [];
    return parsed;
  } catch {
    return { categories: SEED_CATEGORIES, threads: [], replies: [], votes: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.boardCategory.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

async function ensureCategories() {
  if (!(await prismaReady())) return;
  const count = await prisma.boardCategory.count();
  if (count > 0) return;
  await prisma.boardCategory.createMany({
    data: SEED_CATEGORIES.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      sortOrder: c.sortOrder,
    })),
    skipDuplicates: true,
  });
}

export async function listCategories(): Promise<BoardCategoryDto[]> {
  if (await prismaReady()) {
    await ensureCategories();
    const rows = await prisma.boardCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      sortOrder: r.sortOrder,
    }));
  }
  return readStore().categories;
}

export async function listThreads(opts?: {
  categoryId?: string;
  limit?: number;
}): Promise<BoardThreadDto[]> {
  const take = Math.min(opts?.limit ?? 40, 100);
  if (await prismaReady()) {
    await ensureCategories();
    const rows = await prisma.boardThread.findMany({
      where: {
        status: 'ACTIVE',
        ...(opts?.categoryId ? { categoryId: opts.categoryId } : {}),
      },
      orderBy: [{ pinned: 'desc' }, { score: 'desc' }, { createdAt: 'desc' }],
      take,
    });
    return rows.map(mapThread);
  }
  return readStore()
    .threads.filter(
      (t) => t.status === 'ACTIVE' && (!opts?.categoryId || t.categoryId === opts.categoryId),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score)
    .slice(0, take);
}

export async function getThread(id: string) {
  if (await prismaReady()) {
    const row = await prisma.boardThread.findUnique({ where: { id } });
    if (!row) return null;
    const replies = await prisma.boardReply.findMany({
      where: { threadId: id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return { ...mapThread(row), replies: replies.map(mapReply) };
  }
  const store = readStore();
  const thread = store.threads.find((t) => t.id === id);
  if (!thread) return null;
  return { ...thread, replies: store.replies.filter((r) => r.threadId === id) };
}

export async function createThread(input: {
  categoryId: string;
  authorId: string;
  title: string;
  body: string;
}): Promise<BoardThreadDto> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!input.categoryId || !input.authorId || !title || !body) {
    throw new AppError('VALIDATION', 'categoryId, authorId, title, body required', 400);
  }
  if (await prismaReady()) {
    await ensureCategories();
    const row = await prisma.boardThread.create({
      data: {
        id: randomUUID(),
        categoryId: input.categoryId,
        authorId: input.authorId,
        title,
        body,
      },
    });
    return mapThread(row);
  }
  const dto: BoardThreadDto = {
    id: randomUUID(),
    categoryId: input.categoryId,
    authorId: input.authorId,
    title,
    body,
    pinned: false,
    score: 0,
    replyCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.threads.unshift(dto);
  writeStore(store);
  return dto;
}

export async function addReply(input: {
  threadId: string;
  authorId: string;
  body: string;
  parentId?: string;
}): Promise<BoardReplyDto> {
  const body = input.body.trim();
  if (!input.threadId || !input.authorId || !body) {
    throw new AppError('VALIDATION', 'threadId, authorId, body required', 400);
  }
  if (await prismaReady()) {
    const row = await prisma.boardReply.create({
      data: {
        id: randomUUID(),
        threadId: input.threadId,
        authorId: input.authorId,
        parentId: input.parentId || null,
        body,
      },
    });
    await prisma.boardThread.update({
      where: { id: input.threadId },
      data: { replyCount: { increment: 1 } },
    });
    return mapReply(row);
  }
  const dto: BoardReplyDto = {
    id: randomUUID(),
    threadId: input.threadId,
    authorId: input.authorId,
    parentId: input.parentId || null,
    body,
    score: 0,
    createdAt: new Date().toISOString(),
  };
  const store = readStore();
  store.replies.push(dto);
  const t = store.threads.find((x) => x.id === input.threadId);
  if (t) t.replyCount += 1;
  writeStore(store);
  return dto;
}

export async function vote(input: {
  userId: string;
  targetType: 'THREAD' | 'REPLY';
  targetId: string;
  value: 1 | -1 | 0;
}) {
  if (!input.userId || !input.targetId) {
    throw new AppError('VALIDATION', 'userId and targetId required', 400);
  }
  const next = input.value === 1 || input.value === -1 ? input.value : 0;

  if (await prismaReady()) {
    const existing = await prisma.boardVote.findUnique({
      where: {
        userId_targetType_targetId: {
          userId: input.userId,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
    });
    const prev = existing?.value ?? 0;
    const delta = next - prev;
    if (next === 0 && existing) {
      await prisma.boardVote.delete({ where: { id: existing.id } });
    } else if (existing) {
      await prisma.boardVote.update({ where: { id: existing.id }, data: { value: next } });
    } else if (next !== 0) {
      await prisma.boardVote.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          targetType: input.targetType,
          targetId: input.targetId,
          value: next,
        },
      });
    }
    if (delta !== 0) {
      if (input.targetType === 'THREAD') {
        await prisma.boardThread.update({
          where: { id: input.targetId },
          data: { score: { increment: delta } },
        });
      } else {
        await prisma.boardReply.update({
          where: { id: input.targetId },
          data: { score: { increment: delta } },
        });
      }
    }
    return { ok: true as const, value: next, delta };
  }

  const store = readStore();
  const idx = store.votes.findIndex(
    (v) =>
      v.userId === input.userId &&
      v.targetType === input.targetType &&
      v.targetId === input.targetId,
  );
  const prev = idx >= 0 ? store.votes[idx].value : 0;
  const delta = next - prev;
  if (next === 0 && idx >= 0) store.votes.splice(idx, 1);
  else if (idx >= 0) store.votes[idx].value = next;
  else if (next !== 0) {
    store.votes.push({
      userId: input.userId,
      targetType: input.targetType,
      targetId: input.targetId,
      value: next,
    });
  }
  if (input.targetType === 'THREAD') {
    const t = store.threads.find((x) => x.id === input.targetId);
    if (t) t.score += delta;
  } else {
    const r = store.replies.find((x) => x.id === input.targetId);
    if (r) r.score += delta;
  }
  writeStore(store);
  return { ok: true as const, value: next, delta };
}

export async function pinThread(id: string, pinned: boolean) {
  if (await prismaReady()) {
    const row = await prisma.boardThread.update({ where: { id }, data: { pinned } });
    return mapThread(row);
  }
  const store = readStore();
  const t = store.threads.find((x) => x.id === id);
  if (!t) throw new AppError('NOT_FOUND', 'thread not found', 404);
  t.pinned = pinned;
  writeStore(store);
  return t;
}

export async function hideThread(id: string) {
  if (await prismaReady()) {
    const row = await prisma.boardThread.update({
      where: { id },
      data: { status: 'REMOVED' },
    });
    return mapThread(row);
  }
  const store = readStore();
  const t = store.threads.find((x) => x.id === id);
  if (!t) throw new AppError('NOT_FOUND', 'thread not found', 404);
  t.status = 'REMOVED';
  writeStore(store);
  return t;
}

function mapThread(row: {
  id: string;
  categoryId: string;
  authorId: string;
  title: string;
  body: string;
  pinned: boolean;
  score: number;
  replyCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): BoardThreadDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    authorId: row.authorId,
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    score: row.score,
    replyCount: row.replyCount,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapReply(row: {
  id: string;
  threadId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  score: number;
  createdAt: Date;
}): BoardReplyDto {
  return {
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    parentId: row.parentId,
    body: row.body,
    score: row.score,
    createdAt: row.createdAt.toISOString(),
  };
}

export function boardDomainStatus() {
  return {
    domain: 'webboard',
    categories: true,
    nestedReplies: true,
    upvoteDownvote: true,
    pinFeatured: true,
  };
}
