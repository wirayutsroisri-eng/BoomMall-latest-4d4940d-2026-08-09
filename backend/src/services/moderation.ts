import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../lib/errors';

export type ReportKind = 'user' | 'content' | 'message' | 'comment' | 'product' | 'secondhand_listing' | 'job';
export type ReportStatus = 'open' | 'reviewed' | 'actioned' | 'dismissed';
export type ContentModerationStatus = 'hidden' | 'removed' | 'pending_review';
export type UserAccountStatus = 'active' | 'soft_banned' | 'banned' | 'hard_deleted';
export type SocialProvider = 'apple' | 'google' | 'line' | 'facebook' | 'phone';

export type ModerationReport = {
  id: string;
  kind: ReportKind;
  targetId: string;
  targetLabel?: string;
  reason: string;
  details?: string;
  reporterRef?: string;
  sellerUserId?: string;
  targetOwnerId?: string;
  subReason?: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
};

export type ContentModerationRecord = {
  contentId: string;
  status: ContentModerationStatus;
  reason: string;
  authorHandle?: string;
  authorUserId?: string;
  captionPreview?: string;
  actedBy: string;
  actedAt: string;
  relatedReportId?: string;
  auto?: boolean;
};

export type ModeratedUser = {
  id: string;
  displayName: string;
  handle?: string;
  status: UserAccountStatus;
  banCount: number;
  social: Partial<Record<SocialProvider, string>>;
  productIds: string[];
  contentIds: string[];
  createdAt: string;
  updatedAt: string;
  softBannedAt?: string;
  bannedAt?: string;
  hardDeletedAt?: string;
  lastBanReason?: string;
};

export type SocialBlacklistEntry = {
  id: string;
  provider: SocialProvider;
  providerUserId: string;
  userId: string;
  reason: string;
  createdAt: string;
  createdBy: string;
};

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

type StoreShape = {
  reports: ModerationReport[];
  content: Record<string, ContentModerationRecord>;
  users: Record<string, ModeratedUser>;
  blacklist: SocialBlacklistEntry[];
  audit: AuditEntry[];
  keywordBlacklist: string[];
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'moderation.json');
/** Rule 3: auto-hide when unique reporters exceed 3 (>3 → 4+) */
const AUTO_HIDE_REPORT_THRESHOLD = 4;
const PERMA_BAN_AFTER = 2;

function emptyStore(): StoreShape {
  return {
    reports: [],
    content: {},
    users: {},
    blacklist: [],
    audit: [],
    keywordBlacklist: [
      'ยาเสพติด',
      'พนันออนไลน์',
      'หลอกลวงโอนเงิน',
      'porn',
      'sex for sale',
      'ฆ่า',
    ],
  };
}

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function writeStore(store: StoreShape) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function ensureSeed(store: StoreShape): StoreShape {
  if (!store.keywordBlacklist?.length) {
    store.keywordBlacklist = emptyStore().keywordBlacklist;
  }
  if (!store.users) store.users = {};
  if (!store.blacklist) store.blacklist = [];
  if (!store.audit) store.audit = [];
  if (!store.content) store.content = {};
  if (!store.reports) store.reports = [];

  return store;
}

function readStore(): StoreShape {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const seeded = ensureSeed(emptyStore());
      writeStore(seeded);
      return seeded;
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as StoreShape;
    return ensureSeed({
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      content: parsed.content && typeof parsed.content === 'object' ? parsed.content : {},
      users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
      blacklist: Array.isArray(parsed.blacklist) ? parsed.blacklist : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      keywordBlacklist: Array.isArray(parsed.keywordBlacklist)
        ? parsed.keywordBlacklist
        : emptyStore().keywordBlacklist,
    });
  } catch {
    return ensureSeed(emptyStore());
  }
}

function pushAudit(
  store: StoreShape,
  input: { actor: string; action: string; entityType: string; entityId: string; detail?: Record<string, unknown> },
) {
  store.audit = [
    {
      id: newId('aud'),
      actor: input.actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      detail: input.detail ?? {},
      createdAt: new Date().toISOString(),
    },
    ...store.audit,
  ].slice(0, 1000);
}

function uniqueReportsForTarget(store: StoreShape, targetId: string) {
  const reporters = new Set<string>();
  for (const r of store.reports) {
    if (r.targetId !== targetId) continue;
    reporters.add((r.reporterRef || r.id).toLowerCase());
  }
  return reporters.size;
}

function quarantineUserContent(store: StoreShape, user: ModeratedUser, actor: string, reason: string) {
  for (const contentId of user.contentIds) {
    store.content[contentId] = {
      contentId,
      status: 'hidden',
      reason,
      authorHandle: user.handle,
      authorUserId: user.id,
      actedBy: actor,
      actedAt: new Date().toISOString(),
      auto: true,
    };
  }
  for (const productId of user.productIds) {
    store.content[`product:${productId}`] = {
      contentId: `product:${productId}`,
      status: 'hidden',
      reason: `commerce quarantine · ${reason}`,
      authorUserId: user.id,
      actedBy: actor,
      actedAt: new Date().toISOString(),
      auto: true,
    };
  }
}

function addBlacklist(store: StoreShape, user: ModeratedUser, actor: string, reason: string) {
  const now = new Date().toISOString();
  for (const [provider, providerUserId] of Object.entries(user.social) as Array<
    [SocialProvider, string]
  >) {
    if (!providerUserId) continue;
    const exists = store.blacklist.some(
      (b) => b.provider === provider && b.providerUserId === providerUserId,
    );
    if (exists) continue;
    store.blacklist.push({
      id: newId('bl'),
      provider,
      providerUserId,
      userId: user.id,
      reason,
      createdAt: now,
      createdBy: actor,
    });
  }
}

export function scanKeywords(text: string) {
  const store = readStore();
  const hay = text.toLowerCase();
  return store.keywordBlacklist.filter((k) => hay.includes(k.toLowerCase()));
}

export function listReports(status?: string) {
  const store = readStore();
  const rows = !status || status === 'all' ? store.reports : store.reports.filter((r) => r.status === status);
  const counts = new Map<string, Set<string>>();
  for (const report of store.reports) {
    const reporters = counts.get(report.targetId) ?? new Set<string>();
    reporters.add((report.reporterRef ?? report.id).toLowerCase());
    counts.set(report.targetId, reporters);
  }
  return rows.map((report) => ({ ...report, uniqueReporterCount: counts.get(report.targetId)?.size ?? 1 }))
    .sort((a, b) => b.uniqueReporterCount - a.uniqueReporterCount || b.createdAt.localeCompare(a.createdAt));
}

export function createReport(input: {
  kind: ReportKind;
  targetId: string;
  targetLabel?: string;
  reason: string;
  details?: string;
  reporterRef?: string;
  sellerUserId?: string;
  targetOwnerId?: string;
  subReason?: string;
  manualReviewOnly?: boolean;
}) {
  const store = readStore();
  const reporterRef = input.reporterRef?.trim();
  const duplicate = reporterRef && store.reports.find((report) =>
    report.kind === input.kind
    && report.targetId === input.targetId
    && report.reporterRef?.toLowerCase() === reporterRef.toLowerCase()
    && (report.status === 'open' || report.status === 'reviewed'));
  if (duplicate) {
    throw new AppError('DUPLICATE_REPORT', 'คุณได้รายงานประกาศนี้แล้ว', 409);
  }
  const report: ModerationReport = {
    id: newId('rpt'),
    kind: input.kind,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    reason: input.reason,
    details: input.details,
    reporterRef,
    sellerUserId: input.sellerUserId,
    targetOwnerId: input.targetOwnerId,
    subReason: input.subReason,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  store.reports = [report, ...store.reports].slice(0, 500);

  // Rule 3: >3 unique reporters → auto-hide
  const unique = uniqueReportsForTarget(store, input.targetId);
  let autoHide: ContentModerationRecord | null = null;
  if (!input.manualReviewOnly && unique >= AUTO_HIDE_REPORT_THRESHOLD) {
    const existing = store.content[input.targetId];
    if (!existing || existing.status === 'pending_review') {
      autoHide = {
        contentId: input.targetId,
        status: 'hidden',
        reason: `auto-hide · ${unique} unique reports`,
        captionPreview: input.targetLabel,
        actedBy: 'system',
        actedAt: new Date().toISOString(),
        relatedReportId: report.id,
        auto: true,
      };
      store.content[input.targetId] = autoHide;
      pushAudit(store, {
        actor: 'system',
        action: 'auto_hide_content',
        entityType: 'content',
        entityId: input.targetId,
        detail: { uniqueReports: unique },
      });
    }
  }

  writeStore(store);
  return { report, autoHide, uniqueReports: unique };
}

export function listContentActions() {
  const store = readStore();
  return Object.values(store.content).sort((a, b) => b.actedAt.localeCompare(a.actedAt));
}

export function getPublicContentBlocks() {
  const rows = listContentActions();
  const store = readStore();
  const bannedUserIds = Object.values(store.users)
    .filter((u) => u.status === 'banned' || u.status === 'soft_banned' || u.status === 'hard_deleted')
    .map((u) => u.id);
  return {
    hiddenIds: rows.filter((r) => r.status === 'hidden' || r.status === 'pending_review').map((r) => r.contentId),
    removedIds: rows.filter((r) => r.status === 'removed').map((r) => r.contentId),
    bannedUserIds,
    updatedAt: new Date().toISOString(),
  };
}

export function setContentStatus(input: {
  contentId: string;
  status: ContentModerationStatus;
  reason: string;
  actor: string;
  authorHandle?: string;
  authorUserId?: string;
  captionPreview?: string;
  relatedReportId?: string;
  auto?: boolean;
}) {
  const store = readStore();
  const record: ContentModerationRecord = {
    contentId: input.contentId,
    status: input.status,
    reason: input.reason,
    authorHandle: input.authorHandle,
    authorUserId: input.authorUserId,
    captionPreview: input.captionPreview,
    actedBy: input.actor,
    actedAt: new Date().toISOString(),
    relatedReportId: input.relatedReportId,
    auto: input.auto,
  };
  store.content[input.contentId] = record;
  pushAudit(store, {
    actor: input.actor,
    action: `content_${input.status}`,
    entityType: 'content',
    entityId: input.contentId,
    detail: { reason: input.reason },
  });
  writeStore(store);
  return record;
}

export function restoreContent(contentId: string, actor = 'admin') {
  const store = readStore();
  const existing = store.content[contentId];
  if (!existing) return null;
  delete store.content[contentId];
  pushAudit(store, {
    actor,
    action: 'content_restore',
    entityType: 'content',
    entityId: contentId,
    detail: { previous: existing.status },
  });
  writeStore(store);
  return existing;
}

export function resolveReport(input: {
  reportId: string;
  actor: string;
  action: 'hide_content' | 'remove_content' | 'dismiss' | 'mark_reviewed' | 'hide' | 'remove';
  note?: string;
}) {
  const store = readStore();
  const report = store.reports.find((r) => r.id === input.reportId);
  if (!report) return null;

  const normalized =
    input.action === 'hide'
      ? 'hide_content'
      : input.action === 'remove'
        ? 'remove_content'
        : input.action;

  if (normalized === 'hide_content' || normalized === 'remove_content') {
    const status: ContentModerationStatus =
      normalized === 'hide_content' ? 'hidden' : 'removed';
    store.content[report.targetId] = {
      contentId: report.targetId,
      status,
      reason: input.note || report.reason,
      captionPreview: report.targetLabel,
      actedBy: input.actor,
      actedAt: new Date().toISOString(),
      relatedReportId: report.id,
    };
    report.status = 'actioned';
    report.resolution = status === 'hidden' ? 'content_hidden' : 'content_removed';
  } else if (normalized === 'dismiss') {
    report.status = 'dismissed';
    report.resolution = 'dismissed';
  } else {
    report.status = 'reviewed';
    report.resolution = 'reviewed';
  }

  report.resolvedAt = new Date().toISOString();
  report.resolvedBy = input.actor;
  pushAudit(store, {
    actor: input.actor,
    action: `report_${normalized}`,
    entityType: 'report',
    entityId: report.id,
    detail: { targetId: report.targetId },
  });
  writeStore(store);
  return { report, content: store.content[report.targetId] ?? null };
}

/** Rule 9: keyword quarantine before feed */
export function quarantineIfKeywordHit(input: {
  contentId: string;
  text: string;
  authorUserId?: string;
  authorHandle?: string;
  actor?: string;
}) {
  const hits = scanKeywords(input.text);
  if (!hits.length) return { quarantined: false, hits: [] as string[] };
  const record = setContentStatus({
    contentId: input.contentId,
    status: 'pending_review',
    reason: `keyword quarantine · ${hits.join(', ')}`,
    actor: input.actor ?? 'system',
    authorHandle: input.authorHandle,
    authorUserId: input.authorUserId,
    captionPreview: input.text.slice(0, 80),
    auto: true,
  });
  return { quarantined: true, hits, record };
}

export function listUsers() {
  return Object.values(readStore().users).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getUser(userId: string) {
  return readStore().users[userId] ?? null;
}

export function upsertUser(input: {
  id: string;
  displayName: string;
  handle?: string;
  social?: Partial<Record<SocialProvider, string>>;
  productIds?: string[];
  contentIds?: string[];
}) {
  const store = readStore();
  const existing = store.users[input.id];
  const now = new Date().toISOString();
  const user: ModeratedUser = {
    id: input.id,
    displayName: input.displayName,
    handle: input.handle,
    status: existing?.status ?? 'active',
    banCount: existing?.banCount ?? 0,
    social: { ...(existing?.social ?? {}), ...(input.social ?? {}) },
    productIds: input.productIds ?? existing?.productIds ?? [],
    contentIds: input.contentIds ?? existing?.contentIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    softBannedAt: existing?.softBannedAt,
    bannedAt: existing?.bannedAt,
    hardDeletedAt: existing?.hardDeletedAt,
    lastBanReason: existing?.lastBanReason,
  };
  store.users[input.id] = user;
  writeStore(store);
  return user;
}

/** Used only to recreate the App Store Review demo account after testers delete it. */
export function restoreHardDeletedUser(userId: string, displayName: string, handle?: string) {
  const store = readStore();
  const existing = store.users[userId];
  const now = new Date().toISOString();
  store.users[userId] = {
    id: userId,
    displayName,
    handle,
    status: 'active',
    banCount: 0,
    social: {},
    productIds: [],
    contentIds: existing?.contentIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  store.blacklist = store.blacklist.filter((b) => b.userId !== userId);
  writeStore(store);
  return store.users[userId];
}

export function isSocialBlacklisted(provider: SocialProvider, providerUserId: string) {
  const store = readStore();
  return store.blacklist.find(
    (b) => b.provider === provider && b.providerUserId === providerUserId,
  );
}

/**
 * Algorithm soft-lock only — never permanent ban / hard delete / banCount escalation.
 * App Store 1.2: requires a user report (reportId).
 */
export function algorithmSoftLockUser(input: {
  userId: string;
  actor: string;
  reason: string;
  reportId: string;
}) {
  const store = readStore();
  const report = store.reports.find((r) => r.id === input.reportId);
  if (!report) {
    throw new AppError(
      'REPORT_REQUIRED',
      'App Store 1.2: locking an account requires a user report (reportId)',
      400,
    );
  }
  if (report.kind === 'user' && report.targetId !== input.userId) {
    throw new AppError('REPORT_MISMATCH', 'reportId does not match this user', 400);
  }

  let user = store.users[input.userId];
  if (!user) {
    const nowCreate = new Date().toISOString();
    user = {
      id: input.userId,
      displayName: report.targetLabel ?? input.userId,
      handle: undefined,
      status: 'active',
      banCount: 0,
      social: {},
      productIds: [],
      contentIds: [],
      createdAt: nowCreate,
      updatedAt: nowCreate,
    };
    store.users[input.userId] = user;
  }

  if (user.status === 'hard_deleted' || user.status === 'banned') {
    return { user, applied: false as const, reason: `status=${user.status}` };
  }
  if (user.status === 'soft_banned') {
    return { user, applied: false as const, reason: 'already soft-locked' };
  }

  const ts = new Date().toISOString();
  user.status = 'soft_banned';
  user.softBannedAt = ts;
  user.lastBanReason = input.reason;
  user.updatedAt = ts;
  // Do NOT increment banCount — algorithm must never escalate to permanent

  quarantineUserContent(store, user, input.actor, input.reason);

  if (report.status === 'open' || report.status === 'reviewed') {
    report.status = 'actioned';
    report.resolvedAt = ts;
    report.resolvedBy = input.actor;
    report.resolution = 'algorithm_soft_lock';
  }

  pushAudit(store, {
    actor: input.actor,
    action: 'algorithm_soft_lock',
    entityType: 'user',
    entityId: user.id,
    detail: {
      reason: input.reason,
      reportId: input.reportId,
      appleGuideline: '1.2',
      permanentBan: false,
      hardDelete: false,
    },
  });
  writeStore(store);
  return { user, applied: true as const };
}

export function banUser(input: {
  userId: string;
  actor: string;
  reason: string;
  mode?: 'soft' | 'hard';
  /** App Store 1.2 — lock must be tied to a user report */
  reportId: string;
}) {
  const store = readStore();
  const report = store.reports.find((r) => r.id === input.reportId);
  if (!report) {
    throw new AppError(
      'REPORT_REQUIRED',
      'App Store 1.2: locking an account requires a user report (reportId)',
      400,
    );
  }

  const reportTargetsUser =
    report.kind === 'user'
      ? report.targetId === input.userId
      : true; // content/message/comment: ops lock author id supplied with matching report evidence

  if (report.kind === 'user' && report.targetId !== input.userId) {
    throw new AppError('REPORT_MISMATCH', 'reportId does not match this user', 400);
  }
  if (!reportTargetsUser) {
    throw new AppError('REPORT_MISMATCH', 'reportId does not match this user', 400);
  }

  let user = store.users[input.userId];
  if (!user) {
    // Create moderation record from report target so ops can lock without pre-seeding
    const nowCreate = new Date().toISOString();
    user = {
      id: input.userId,
      displayName: report.targetLabel ?? input.userId,
      handle: undefined,
      status: 'active',
      banCount: 0,
      social: {},
      productIds: [],
      contentIds: [],
      createdAt: nowCreate,
      updatedAt: nowCreate,
    };
    store.users[input.userId] = user;
  }
  if (user.status === 'hard_deleted') return { user, permanent: false, unlocked: false as const };

  const mode = input.mode ?? 'hard';
  const now = new Date().toISOString();
  user.banCount += 1;
  user.lastBanReason = input.reason;
  user.updatedAt = now;

  // Rule 3: 2 bans → permanent
  const permanent = user.banCount >= PERMA_BAN_AFTER || mode === 'hard';
  if (permanent) {
    user.status = 'banned';
    user.bannedAt = now;
    addBlacklist(store, user, input.actor, input.reason);
  } else {
    user.status = 'soft_banned';
    user.softBannedAt = now;
  }

  // Rule 7: quarantine commerce + UGC
  quarantineUserContent(store, user, input.actor, input.reason);

  // Mark related report actioned
  if (report.status === 'open' || report.status === 'reviewed') {
    report.status = 'actioned';
    report.resolvedAt = now;
    report.resolvedBy = input.actor;
    report.resolution = permanent ? 'account_locked_permanent' : 'account_locked_temporary';
  }

  pushAudit(store, {
    actor: input.actor,
    action: permanent ? 'user_lock_permanent' : 'user_lock_temporary',
    entityType: 'user',
    entityId: user.id,
    detail: {
      reason: input.reason,
      banCount: user.banCount,
      reportId: input.reportId,
      reportReason: report.reason,
      appleGuideline: '1.2',
    },
  });
  writeStore(store);
  return { user, permanent };
}

/**
 * Unlock / restore account after human review.
 * Hard-deleted accounts cannot be unlocked (PDPA purge).
 */
export function unlockUser(input: {
  userId: string;
  actor: string;
  reason: string;
  reportId?: string;
}) {
  if (!input.reason.trim()) {
    throw new AppError('VALIDATION', 'Unlock reason is required', 400);
  }
  const store = readStore();
  const user = store.users[input.userId];
  if (!user) return null;
  if (user.status === 'hard_deleted') {
    throw new AppError('FORBIDDEN', 'Hard-deleted accounts cannot be unlocked', 403);
  }
  if (user.status === 'active') {
    return { user, changed: false };
  }

  const now = new Date().toISOString();
  const previous = user.status;
  user.status = 'active';
  user.softBannedAt = undefined;
  user.bannedAt = undefined;
  user.updatedAt = now;
  user.lastBanReason = undefined;

  // Remove social blacklist rows for this user (unlock restores access)
  store.blacklist = store.blacklist.filter((b) => b.userId !== user.id);

  if (input.reportId) {
    const report = store.reports.find((r) => r.id === input.reportId);
    if (report) {
      report.status = 'reviewed';
      report.resolvedAt = now;
      report.resolvedBy = input.actor;
      report.resolution = 'account_unlocked';
    }
  }

  pushAudit(store, {
    actor: input.actor,
    action: 'user_unlock',
    entityType: 'user',
    entityId: user.id,
    detail: {
      reason: input.reason.trim(),
      previousStatus: previous,
      reportId: input.reportId,
      appleGuideline: '1.2',
    },
  });
  writeStore(store);
  return { user, changed: true, previousStatus: previous };
}

export function reportsForTarget(targetId: string) {
  return readStore().reports.filter((r) => r.targetId === targetId);
}

export function hardDeleteUser(input: { userId: string; actor: string; reason?: string; allowReRegistration?: boolean }) {
  const store = readStore();
  const user = store.users[input.userId];
  if (!user) return null;

  const reason = input.reason || 'PDPA hard delete';
  const now = new Date().toISOString();

  // Blacklist social ids before purge
  if (input.allowReRegistration) {
    store.blacklist = store.blacklist.filter((entry) => entry.userId !== input.userId);
  } else {
    addBlacklist(store, user, input.actor, reason);
  }
  quarantineUserContent(store, user, input.actor, reason);

  // Rule 8: purge personal fields
  user.displayName = 'deleted_user';
  user.handle = undefined;
  user.social = {};
  user.status = 'hard_deleted';
  user.hardDeletedAt = now;
  user.updatedAt = now;
  user.productIds = [];
  // keep contentIds for blocklist continuity

  pushAudit(store, {
    actor: input.actor,
    action: 'user_hard_delete',
    entityType: 'user',
    entityId: user.id,
    detail: { reason },
  });
  writeStore(store);
  return user;
}

export function listBlacklist() {
  return readStore().blacklist;
}

export function listAudit(limit = 50) {
  return readStore().audit.slice(0, limit);
}

export function listKeywords() {
  return readStore().keywordBlacklist;
}

export function moderationStats() {
  const store = readStore();
  const open = store.reports.filter((r) => r.status === 'open').length;
  const actioned = store.reports.filter((r) => r.status === 'actioned').length;
  const hidden = Object.values(store.content).filter((c) => c.status === 'hidden').length;
  const removed = Object.values(store.content).filter((c) => c.status === 'removed').length;
  const pending = Object.values(store.content).filter((c) => c.status === 'pending_review').length;
  const autoHidden = Object.values(store.content).filter((c) => c.auto && c.status === 'hidden').length;
  const bannedUsers = Object.values(store.users).filter(
    (u) => u.status === 'banned' || u.status === 'soft_banned',
  ).length;
  const hardDeleted = Object.values(store.users).filter((u) => u.status === 'hard_deleted').length;

  const categoryCount: Record<string, number> = {};
  for (const r of store.reports) {
    categoryCount[r.reason] = (categoryCount[r.reason] ?? 0) + 1;
  }
  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    openReports: open,
    actionedReports: actioned,
    hiddenPosts: hidden,
    removedPosts: removed,
    pendingReview: pending,
    autoHiddenPosts: autoHidden,
    bannedUsers,
    hardDeletedUsers: hardDeleted,
    blacklistEntries: store.blacklist.length,
    topCategories,
  };
}
