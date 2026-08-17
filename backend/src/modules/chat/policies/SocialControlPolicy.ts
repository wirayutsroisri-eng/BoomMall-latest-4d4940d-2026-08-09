/**
 * Chat & Social control policy — App Store UGC (report/block), rate limits, retention (OPEX).
 */

import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { EULA_CHAT_C4, hasAcceptedEula } from '../../auth/ProfileService';
import { createReport, listReports, type ModerationReport } from '../../../services/moderation';

export type SocialPolicyDto = {
  id: string;
  maxMessagesPerMinute: number;
  maxMessagesPerDay: number;
  mediaRetentionDays: number;
  textRetentionDays: number;
  requireEulaForChat: boolean;
  eulaVersion: string;
  reportBlockEnabled: boolean;
  moderationEnabled: boolean;
  updatedAt: string;
  updatedBy?: string | null;
};

const DATA_FILE = path.join(process.cwd(), 'data', 'social-control.json');
const rateBuckets = new Map<string, number[]>();

function defaultPolicy(): SocialPolicyDto {
  return {
    id: 'GLOBAL_SOCIAL',
    maxMessagesPerMinute: 30,
    maxMessagesPerDay: 2000,
    mediaRetentionDays: 90,
    textRetentionDays: 365,
    requireEulaForChat: true,
    eulaVersion: 'c4-2026.1',
    reportBlockEnabled: true,
    moderationEnabled: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

function readJsonPolicy(): SocialPolicyDto {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const d = defaultPolicy();
      writeJsonPolicy(d);
      return d;
    }
    return { ...defaultPolicy(), ...(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as object) };
  } catch {
    return defaultPolicy();
  }
}

function writeJsonPolicy(p: SocialPolicyDto) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(p, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.socialControlPolicy.findUnique({ where: { id: 'GLOBAL_SOCIAL' } });
    return true;
  } catch {
    return false;
  }
}

export async function getSocialPolicy(): Promise<SocialPolicyDto> {
  if (await prismaReady()) {
    let row = await prisma.socialControlPolicy.findUnique({ where: { id: 'GLOBAL_SOCIAL' } });
    if (!row) {
      const d = defaultPolicy();
      row = await prisma.socialControlPolicy.create({
        data: {
          id: 'GLOBAL_SOCIAL',
          maxMessagesPerMinute: d.maxMessagesPerMinute,
          maxMessagesPerDay: d.maxMessagesPerDay,
          mediaRetentionDays: d.mediaRetentionDays,
          textRetentionDays: d.textRetentionDays,
          requireEulaForChat: d.requireEulaForChat,
          eulaVersion: d.eulaVersion,
          reportBlockEnabled: d.reportBlockEnabled,
          moderationEnabled: d.moderationEnabled,
          updatedBy: d.updatedBy,
        },
      });
    }
    return {
      id: row.id,
      maxMessagesPerMinute: row.maxMessagesPerMinute,
      maxMessagesPerDay: row.maxMessagesPerDay,
      mediaRetentionDays: row.mediaRetentionDays,
      textRetentionDays: row.textRetentionDays,
      requireEulaForChat: row.requireEulaForChat,
      eulaVersion: row.eulaVersion,
      reportBlockEnabled: row.reportBlockEnabled,
      moderationEnabled: row.moderationEnabled,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }
  return readJsonPolicy();
}

export async function saveSocialPolicy(
  patch: Partial<SocialPolicyDto> & { actor: string },
): Promise<SocialPolicyDto> {
  const cur = await getSocialPolicy();
  const next: SocialPolicyDto = {
    ...cur,
    ...patch,
    id: 'GLOBAL_SOCIAL',
    updatedAt: new Date().toISOString(),
    updatedBy: patch.actor,
  };

  if (await prismaReady()) {
    const row = await prisma.socialControlPolicy.upsert({
      where: { id: 'GLOBAL_SOCIAL' },
      create: {
        id: 'GLOBAL_SOCIAL',
        maxMessagesPerMinute: next.maxMessagesPerMinute,
        maxMessagesPerDay: next.maxMessagesPerDay,
        mediaRetentionDays: next.mediaRetentionDays,
        textRetentionDays: next.textRetentionDays,
        requireEulaForChat: next.requireEulaForChat,
        eulaVersion: next.eulaVersion,
        reportBlockEnabled: next.reportBlockEnabled,
        moderationEnabled: next.moderationEnabled,
        updatedBy: next.updatedBy,
      },
      update: {
        maxMessagesPerMinute: next.maxMessagesPerMinute,
        maxMessagesPerDay: next.maxMessagesPerDay,
        mediaRetentionDays: next.mediaRetentionDays,
        textRetentionDays: next.textRetentionDays,
        requireEulaForChat: next.requireEulaForChat,
        eulaVersion: next.eulaVersion,
        reportBlockEnabled: next.reportBlockEnabled,
        moderationEnabled: next.moderationEnabled,
        updatedBy: next.updatedBy,
      },
    });
    return {
      ...next,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  writeJsonPolicy(next);
  return next;
}

function pruneBuckets(userId: string, now = Date.now()) {
  const arr = (rateBuckets.get(userId) ?? []).filter((t) => now - t < 86_400_000);
  rateBuckets.set(userId, arr);
  return arr;
}

export async function assertChatSendAllowed(userId: string): Promise<SocialPolicyDto> {
  const policy = await getSocialPolicy();

  if (policy.requireEulaForChat) {
    const ok = await hasAcceptedEula(userId, EULA_CHAT_C4, policy.eulaVersion);
    if (!ok) {
      throw new AppError(
        'EULA_REQUIRED',
        `Accept App Store C4 EULA (${policy.eulaVersion}) before chatting`,
        403,
      );
    }
  }

  const now = Date.now();
  const times = pruneBuckets(userId, now);
  const lastMin = times.filter((t) => now - t < 60_000).length;
  if (lastMin >= policy.maxMessagesPerMinute) {
    throw new AppError('RATE_LIMIT', `max ${policy.maxMessagesPerMinute} messages/minute`, 429);
  }
  if (times.length >= policy.maxMessagesPerDay) {
    throw new AppError('RATE_LIMIT', `max ${policy.maxMessagesPerDay} messages/day`, 429);
  }

  times.push(now);
  rateBuckets.set(userId, times);
  return policy;
}

/** Retention cutoff helpers for flush/purge jobs (OPEX control) */
export function retentionCutoff(policy: SocialPolicyDto, kind: 'media' | 'text'): Date {
  const days = kind === 'media' ? policy.mediaRetentionDays : policy.textRetentionDays;
  return new Date(Date.now() - days * 86_400_000);
}

export function reportChatMessage(input: {
  messageId: string;
  reporterRef?: string;
  reason: string;
  details?: string;
}) {
  return createReport({
    kind: 'message',
    targetId: input.messageId,
    reason: input.reason,
    details: input.details,
    reporterRef: input.reporterRef ?? 'app-user',
  });
}

export function chatSocialDomainStatus(policy?: SocialPolicyDto) {
  const p = policy ?? readJsonPolicy();
  const openReports = listReports('open').filter((r: ModerationReport) => r.kind === 'message').length;
  return {
    domain: 'chat-realtime-social',
    transport: 'socket.io',
    appleGuideline: '1.2 UGC — report/block/moderation + EULA (C4)',
    reportBlockEnabled: p.reportBlockEnabled,
    moderationEnabled: p.moderationEnabled,
    requireEulaForChat: p.requireEulaForChat,
    eulaVersion: p.eulaVersion,
    maxMessagesPerMinute: p.maxMessagesPerMinute,
    maxMessagesPerDay: p.maxMessagesPerDay,
    mediaRetentionDays: p.mediaRetentionDays,
    textRetentionDays: p.textRetentionDays,
    openMessageReports: openReports,
    opexNote: 'Retention caps reduce cloud storage cost',
  };
}
