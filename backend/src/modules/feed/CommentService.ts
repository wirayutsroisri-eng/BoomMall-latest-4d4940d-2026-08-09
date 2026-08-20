import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export type CommentDto = {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string | null;
  authorHandle?: string | null;
  parentId: string | null;
  body: string;
  likeCount: number;
  createdAt: string;
};

type Store = { comments: CommentDto[] };
const DATA_FILE = path.join(process.cwd(), 'data', 'social-comments.json');

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) return { comments: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Store;
  } catch {
    return { comments: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.socialComment.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function listComments(postId: string, limit = 80): Promise<CommentDto[]> {
  if (await prismaReady()) {
    const rows = await prisma.socialComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 200),
    });
    if (rows.length > 0) {
      const authorIds = [...new Set(rows.map((row) => row.authorId))];
      const profiles =
        authorIds.length > 0
          ? await prisma.userProfile.findMany({
              where: { userId: { in: authorIds } },
              select: { userId: true, displayName: true, handle: true },
            })
          : [];
      const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));
      return rows.map((row) => mapComment(row, profileByUserId.get(row.authorId)));
    }
  }
  return readStore()
    .comments.filter((c) => c.postId === postId)
    .slice(0, limit)
    .map((row) => mapComment(row));
}

export async function addComment(input: {
  postId: string;
  authorId: string;
  body: string;
  parentId?: string;
}): Promise<CommentDto> {
  const body = input.body.trim();
  if (!input.postId || !input.authorId || !body) {
    throw new AppError('VALIDATION', 'postId, authorId, body required', 400);
  }
  if (body.length > 2000) throw new AppError('VALIDATION', 'comment too long', 400);

  if (await prismaReady()) {
    const row = await prisma.socialComment.create({
      data: {
        id: randomUUID(),
        postId: input.postId,
        authorId: input.authorId,
        parentId: input.parentId || null,
        body,
      },
    });
    try {
      await prisma.socialPost.update({
        where: { id: input.postId },
        data: { commentCount: { increment: 1 } },
      });
    } catch {
      /* mock feed ids are not SocialPost rows */
    }
    return mapComment(row);
  }

  const dto: CommentDto = {
    id: randomUUID(),
    postId: input.postId,
    authorId: input.authorId,
    parentId: input.parentId || null,
    body,
    likeCount: 0,
    createdAt: new Date().toISOString(),
  };
  const store = readStore();
  store.comments.push(dto);
  writeStore(store);
  return dto;
}

export async function toggleCommentLike(commentId: string, liked: boolean) {
  const delta = liked ? 1 : -1;
  if (await prismaReady()) {
    try {
      const row = await prisma.socialComment.update({
        where: { id: commentId },
        data: { likeCount: { increment: delta } },
      });
      if (row.likeCount < 0) {
        return mapComment(
          await prisma.socialComment.update({ where: { id: commentId }, data: { likeCount: 0 } }),
        );
      }
      return mapComment(row);
    } catch {
      return null;
    }
  }
  const store = readStore();
  const idx = store.comments.findIndex((c) => c.id === commentId);
  if (idx < 0) return null;
  store.comments[idx] = {
    ...store.comments[idx],
    likeCount: Math.max(0, store.comments[idx].likeCount + delta),
  };
  writeStore(store);
  return store.comments[idx];
}

function mapComment(
  row: {
    id: string;
    postId: string;
    authorId: string;
    parentId: string | null;
    body: string;
    likeCount: number;
    createdAt: Date | string;
  },
  profile?: { displayName: string | null; handle: string | null } | null,
): CommentDto {
  return {
    id: row.id,
    postId: row.postId,
    authorId: row.authorId,
    authorName: profile?.displayName ?? null,
    authorHandle: profile?.handle ?? null,
    parentId: row.parentId,
    body: row.body,
    likeCount: row.likeCount,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : row.createdAt.toISOString(),
  };
}
