/**
 * BoomMall Trust & Safety Control Center — extends existing moderation.
 * Persistence: data/trust-safety.json (alongside moderation.json / chat-admin.json).
 * No mock metrics — empty queues are real zeros.
 */

import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../../lib/errors';
import {
  listAudit,
  listBlacklist,
  listContentActions,
  listReports,
  listUsers,
  moderationStats,
  type ModeratedUser,
  type ModerationReport,
} from '../moderation';
import {
  bandForScore,
  computeRisk,
  defaultWeights,
  type RiskBand,
  type RiskBreakdown,
  type RiskSignal,
} from './risk';
import {
  createModerationPolicy,
  listModerationPolicies,
  listModerationStates,
  parseNaturalLanguagePolicy,
  runDynamicModerationEngine,
  type EngineRunResult,
  type ParsedModerationRules,
} from './dynamicEngine';

export type { RiskBand, RiskBreakdown, RiskSignal };
export { bandForScore, computeRisk, defaultWeights };

export type SafetyReportStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'ACTION_TAKEN'
  | 'NO_VIOLATION'
  | 'ESCALATED'
  | 'CLOSED';

export type CaseStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'CLOSED';

export type CaseAction =
  | 'allow'
  | 'warn'
  | 'limit_reach'
  | 'hide'
  | 'remove'
  | 'restrict_user'
  | 'suspend'
  | 'escalate';

export type AppealStatus = 'PENDING' | 'UPHELD' | 'MODIFIED' | 'REVERSED' | 'ESCALATED';

export type PlatformCapability =
  | 'POST'
  | 'COMMENT'
  | 'MESSAGE'
  | 'SELL'
  | 'BUY'
  | 'LIVE'
  | 'ADVERTISE'
  | 'AFFILIATE'
  | 'JOB'
  | 'UPLOAD_MEDIA';

export type PolicyStatus = 'DRAFT' | 'TESTING' | 'ACTIVE' | 'ROLLED_BACK' | 'ARCHIVED';

export type ListKind = 'BLOCKLIST' | 'WATCHLIST';

const CAPABILITIES: PlatformCapability[] = [
  'POST',
  'COMMENT',
  'MESSAGE',
  'SELL',
  'BUY',
  'LIVE',
  'ADVERTISE',
  'AFFILIATE',
  'JOB',
  'UPLOAD_MEDIA',
];

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'trust-safety.json');

function now() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type SafetyCase = {
  id: string;
  userId?: string;
  contentId?: string;
  reportIds: string[];
  previousViolations: number;
  risk: RiskBreakdown;
  aiRecommendation?: AiRecommendation;
  moderator?: string;
  status: CaseStatus;
  timeline: Array<{ at: string; actor: string; event: string; detail?: string }>;
  createdAt: string;
  updatedAt: string;
};

export type AiRecommendation = {
  action: CaseAction | 'restrict_messaging';
  confidence: number;
  reason: string;
  policyMatched: string;
  createdAt: string;
};

export type Appeal = {
  id: string;
  userId: string;
  targetType: 'content_removal' | 'restriction' | 'suspension' | 'seller_restriction';
  targetId: string;
  originalAction: string;
  originalReason: string;
  evidence?: string;
  appealText: string;
  status: AppealStatus;
  decisionNote?: string;
  decidedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type SafetyPolicy = {
  id: string;
  version: string;
  status: PolicyStatus;
  instruction: string;
  thresholds: {
    spam: number;
    scam: number;
    harassment: number;
    illegalGoods: number;
  };
  weights: Record<RiskSignal, number>;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy: string;
};

export type AutoModConfig = {
  spamProtection: number;
  scamDetection: number;
  harassmentDetection: number;
  fakeAccountDetection: number;
  botDetection: number;
  illegalGoodsDetection: number;
  repeatOffenderDetection: number;
  autoFlag: boolean;
  autoLimitReach: boolean;
  autoHide: boolean;
  /** Soft-lock from algorithm when risk high + user report exists */
  autoSoftLock: boolean;
  /** Auto unlock soft locks when time/risk allows */
  autoUnlock: boolean;
  /** Minimum risk score to soft-lock (0–100) */
  softLockRiskMin: number;
  /** Max risk to allow auto-unlock */
  unlockRiskMax: number;
  /** Hours before soft-lock can auto-unlock */
  softLockHours: number;
  /** Latest admin directive (Thai/EN guidance) */
  activeDirective: string;
  /** Never true for permanent ban from AI alone */
  autoPermanentBan: false;
  updatedAt: string;
  updatedBy: string;
};

export type AlgorithmDirective = {
  id: string;
  text: string;
  actor: string;
  parsed: {
    autoSoftLock?: boolean;
    autoUnlock?: boolean;
    softLockRiskMin?: number;
    unlockRiskMax?: number;
    softLockHours?: number;
    scamDetection?: number;
    spamProtection?: number;
    note: string;
  };
  createdAt: string;
};

export type AlgorithmRunResult = {
  id: string;
  at: string;
  locked: Array<{ userId: string; reportId: string; risk: number; reason: string }>;
  unlocked: Array<{ userId: string; reason: string }>;
  skipped: Array<{ userId?: string; reportId?: string; reason: string }>;
  directive?: string;
};

export type PlatformRestrictions = {
  userId: string;
  capabilities: Record<PlatformCapability, boolean>;
  reason: string;
  updatedAt: string;
  updatedBy: string;
};

export type WarningRecord = {
  id: string;
  userId: string;
  reason: string;
  relatedCaseId?: string;
  actor: string;
  createdAt: string;
};

export type ExtendedListEntry = {
  id: string;
  kind: ListKind;
  type: 'user' | 'keyword' | 'url' | 'domain' | 'phone_pattern' | 'product_keyword';
  value: string;
  reason: string;
  createdAt: string;
  createdBy: string;
};

export type SafetyAudit = {
  id: string;
  admin: string;
  action: string;
  targetType: string;
  targetId: string;
  previousState?: string;
  newState?: string;
  reason: string;
  policyVersion?: string;
  time: string;
};

type StoreShape = {
  cases: SafetyCase[];
  appeals: Appeal[];
  policies: SafetyPolicy[];
  activePolicyId: string;
  autoMod: AutoModConfig;
  restrictions: Record<string, PlatformRestrictions>;
  warnings: WarningRecord[];
  lists: ExtendedListEntry[];
  audit: SafetyAudit[];
  proposedPolicies: Array<{
    id: string;
    prompt: string;
    proposed: Partial<SafetyPolicy>;
    expectedImpact: string;
    risk: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    createdBy: string;
  }>;
  directives: AlgorithmDirective[];
  algorithmRuns: AlgorithmRunResult[];
};

function defaultPolicy(actor: string): SafetyPolicy {
  const ts = now();
  return {
    id: 'spol_v1_0',
    version: 'v1.0',
    status: 'ACTIVE',
    instruction:
      'Protect users from spam, scam, and harassment. Prefer reversible limits. Never permanent ban from AI alone — human review required.',
    thresholds: { spam: 55, scam: 65, harassment: 60, illegalGoods: 70 },
    weights: defaultWeights(),
    createdAt: ts,
    updatedAt: ts,
    publishedAt: ts,
    createdBy: actor,
  };
}

function defaultAutoMod(): AutoModConfig {
  return {
    spamProtection: 55,
    scamDetection: 65,
    harassmentDetection: 60,
    fakeAccountDetection: 50,
    botDetection: 55,
    illegalGoodsDetection: 70,
    repeatOffenderDetection: 60,
    autoFlag: true,
    autoLimitReach: true,
    autoHide: false,
    autoSoftLock: true,
    autoUnlock: true,
    softLockRiskMin: 65,
    unlockRiskMax: 35,
    softLockHours: 24,
    activeDirective:
      'ล็อกชั่วคราวอัตโนมัติเมื่อมีรายงานจากผู้ใช้และคะแนนความเสี่ยงสูง — ปลดล็อกเองเมื่อครบเวลาหรือความเสี่ยงลด ห้ามแบนถาวรโดยอัลกอริทึม',
    autoPermanentBan: false,
    updatedAt: now(),
    updatedBy: 'system',
  };
}

function emptyStore(): StoreShape {
  const policy = defaultPolicy('system');
  return {
    cases: [],
    appeals: [],
    policies: [policy],
    activePolicyId: policy.id,
    autoMod: defaultAutoMod(),
    restrictions: {},
    warnings: [],
    lists: [],
    audit: [],
    proposedPolicies: [],
    directives: [],
    algorithmRuns: [],
  };
}

function writeStore(store: StoreShape) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function readStore(): StoreShape {
  if (!fs.existsSync(DATA_FILE)) {
    const s = emptyStore();
    writeStore(s);
    return s;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as StoreShape;
    const base = emptyStore();
    return {
      ...base,
      ...parsed,
      cases: parsed.cases ?? [],
      appeals: parsed.appeals ?? [],
      directives: parsed.directives ?? [],
      algorithmRuns: parsed.algorithmRuns ?? [],
      autoMod: { ...base.autoMod, ...(parsed.autoMod ?? {}) },
    };
  } catch {
    const s = emptyStore();
    writeStore(s);
    return s;
  }
}

function pushAudit(
  store: StoreShape,
  row: Omit<SafetyAudit, 'id' | 'time'> & { time?: string },
) {
  store.audit = [
    {
      id: newId('saud'),
      time: row.time ?? now(),
      admin: row.admin,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      previousState: row.previousState,
      newState: row.newState,
      reason: row.reason,
      policyVersion: row.policyVersion,
    },
    ...store.audit,
  ].slice(0, 5000);
}

function mapLegacyStatus(s: ModerationReport['status']): SafetyReportStatus {
  if (s === 'open') return 'OPEN';
  if (s === 'reviewed') return 'IN_REVIEW';
  if (s === 'actioned') return 'ACTION_TAKEN';
  if (s === 'dismissed') return 'NO_VIOLATION';
  return 'OPEN';
}

function daysAgo(n: number) {
  return Date.now() - n * 86400000;
}

function countSince(isoList: string[], sinceMs: number) {
  return isoList.filter((t) => new Date(t).getTime() >= sinceMs).length;
}

export function getSafetyOverview() {
  const store = readStore();
  const reports = listReports('all');
  const users = listUsers();
  const content = listContentActions();
  const stats = moderationStats();

  const reportTimes = reports.map((r) => r.createdAt);
  const openReports = reports.filter((r) => r.status === 'open' || r.status === 'reviewed');
  const criticalCases = store.cases.filter(
    (c) => c.status === 'OPEN' || c.status === 'IN_REVIEW'
      ? c.risk.band === 'Critical' || c.risk.band === 'High'
      : false,
  );
  const restricted = Object.values(store.restrictions).filter((r) =>
    Object.values(r.capabilities).some((v) => v === false),
  );
  const appealsPending = store.appeals.filter((a) => a.status === 'PENDING');
  const spamAlerts = openReports.filter((r) => /spam/i.test(r.reason)).length;
  const scamAlerts = openReports.filter((r) => /scam|หลอก|โอน/i.test(r.reason)).length;

  const trend = (n: number) => ({
    reports: countSince(reportTimes, daysAgo(n)),
    cases: countSince(
      store.cases.map((c) => c.createdAt),
      daysAgo(n),
    ),
    appeals: countSince(
      store.appeals.map((a) => a.createdAt),
      daysAgo(n),
    ),
  });

  return {
    newReports: openReports.length,
    criticalCases: criticalCases.length,
    pendingReview: stats.pendingReview ?? content.filter((c) => c.status === 'pending_review').length,
    autoHidden: stats.autoHiddenPosts ?? 0,
    bannedUsers: stats.bannedUsers ?? 0,
    restrictedUsers: restricted.length,
    appealsPending: appealsPending.length,
    spamAlerts,
    scamAlerts,
    chatAbuseAlerts: openReports.filter((r) => r.kind === 'message').length,
    trends: {
      today: trend(1),
      days7: trend(7),
      days30: trend(30),
    },
    generatedAt: now(),
  };
}

export function listSafetyReports(filters: {
  status?: string;
  reason?: string;
  kind?: string;
  riskMin?: number;
}) {
  const store = readStore();
  const policy = store.policies.find((p) => p.id === store.activePolicyId);
  return listReports('all')
    .map((r) => {
      const risk = computeRisk({
        reasons: [r.reason, r.details ?? ''],
        weights: policy?.weights,
      });
      return {
        ...r,
        statusLabel: mapLegacyStatus(r.status),
        riskScore: risk.score,
        riskBand: risk.band,
        riskSignals: risk.signals,
        reportCount: listReports('all').filter((x) => x.targetId === r.targetId).length,
      };
    })
    .filter((r) => {
      if (filters.status && filters.status !== 'all') {
        if (mapLegacyStatus(r.status) !== filters.status) return false;
      }
      if (filters.reason && !r.reason.toLowerCase().includes(filters.reason.toLowerCase())) {
        return false;
      }
      if (filters.kind && r.kind !== filters.kind) return false;
      if (filters.riskMin != null && r.riskScore < filters.riskMin) return false;
      return true;
    });
}

export function listCases(status?: string) {
  const store = readStore();
  if (!status || status === 'all') return store.cases;
  return store.cases.filter((c) => c.status === status);
}

export function createCaseFromReports(input: {
  reportIds: string[];
  actor: string;
  userId?: string;
  contentId?: string;
}) {
  if (!input.reportIds.length) throw new AppError('VALIDATION', 'reportIds required', 400);
  const store = readStore();
  const all = listReports('all');
  const selected = all.filter((r) => input.reportIds.includes(r.id));
  if (!selected.length) throw new AppError('NOT_FOUND', 'No matching reports', 404);

  const userId =
    input.userId ??
    (selected.find((r) => r.kind === 'user')?.targetId || selected[0]?.targetId);
  const contentId =
    input.contentId ??
    selected.find((r) => r.kind === 'content' || r.kind === 'comment')?.targetId;
  const user = listUsers().find((u) => u.id === userId);
  const risk = computeRisk({
    reasons: selected.map((r) => r.reason),
    previousViolations: user?.banCount ?? 0,
  });
  const policy = store.policies.find((p) => p.id === store.activePolicyId);

  const ai: AiRecommendation = {
    action: risk.band === 'Critical' || risk.band === 'High' ? 'restrict_user' : 'hide',
    confidence: Math.min(99, 55 + risk.score / 2),
    reason: risk.signals.map((s) => s.signal).join(', ') || selected[0].reason,
    policyMatched: `Safety Policy ${policy?.version ?? 'v1.0'}`,
    createdAt: now(),
  };

  const c: SafetyCase = {
    id: newId('case'),
    userId,
    contentId,
    reportIds: selected.map((r) => r.id),
    previousViolations: user?.banCount ?? 0,
    risk,
    aiRecommendation: ai,
    moderator: input.actor,
    status: 'OPEN',
    timeline: [
      {
        at: now(),
        actor: input.actor,
        event: 'case_created',
        detail: `${selected.length} reports merged`,
      },
      {
        at: now(),
        actor: 'ai',
        event: 'ai_recommendation',
        detail: `${ai.action} · ${ai.confidence}%`,
      },
    ],
    createdAt: now(),
    updatedAt: now(),
  };
  store.cases = [c, ...store.cases];
  pushAudit(store, {
    admin: input.actor,
    action: 'case.create',
    targetType: 'case',
    targetId: c.id,
    newState: c.status,
    reason: 'Merged reports into case',
    policyVersion: policy?.version,
  });
  writeStore(store);
  return c;
}

export function actOnCase(input: {
  caseId: string;
  action: CaseAction;
  actor: string;
  note?: string;
  aiDecision?: 'approve' | 'modify' | 'reject';
}) {
  const store = readStore();
  const c = store.cases.find((x) => x.id === input.caseId);
  if (!c) throw new AppError('NOT_FOUND', 'Case not found', 404);
  const prev = c.status;

  if (input.action === 'escalate') c.status = 'ESCALATED';
  else if (input.action === 'allow') c.status = 'RESOLVED';
  else c.status = 'RESOLVED';

  c.moderator = input.actor;
  c.updatedAt = now();
  c.timeline.push({
    at: now(),
    actor: input.actor,
    event: `action_${input.action}`,
    detail: input.note,
  });
  if (input.aiDecision) {
    c.timeline.push({
      at: now(),
      actor: input.actor,
      event: `ai_${input.aiDecision}`,
      detail: c.aiRecommendation?.action,
    });
  }

  if (input.action === 'warn' && c.userId) {
    store.warnings.unshift({
      id: newId('warn'),
      userId: c.userId,
      reason: input.note || 'Warning from case',
      relatedCaseId: c.id,
      actor: input.actor,
      createdAt: now(),
    });
  }

  if (input.action === 'restrict_user' && c.userId) {
    const caps = Object.fromEntries(CAPABILITIES.map((k) => [k, true])) as Record<
      PlatformCapability,
      boolean
    >;
    caps.POST = false;
    caps.COMMENT = false;
    caps.MESSAGE = false;
    store.restrictions[c.userId] = {
      userId: c.userId,
      capabilities: caps,
      reason: input.note || 'Restricted via case',
      updatedAt: now(),
      updatedBy: input.actor,
    };
  }

  const policy = store.policies.find((p) => p.id === store.activePolicyId);
  pushAudit(store, {
    admin: input.actor,
    action: `case.${input.action}`,
    targetType: 'case',
    targetId: c.id,
    previousState: prev,
    newState: c.status,
    reason: input.note || input.action,
    policyVersion: policy?.version,
  });
  writeStore(store);
  return c;
}

export function getUserSafetyProfile(userId: string) {
  const store = readStore();
  const user = listUsers().find((u) => u.id === userId);
  const reports = listReports('all').filter(
    (r) => r.targetId === userId || r.reporterRef === userId,
  );
  const content = listContentActions().filter(
    (c) => c.authorUserId === userId || c.contentId.includes(userId),
  );
  const cases = store.cases.filter((c) => c.userId === userId);
  const appeals = store.appeals.filter((a) => a.userId === userId);
  const warnings = store.warnings.filter((w) => w.userId === userId);
  const restrictions =
    store.restrictions[userId] ??
    ({
      userId,
      capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c, true])) as Record<
        PlatformCapability,
        boolean
      >,
      reason: 'default',
      updatedAt: now(),
      updatedBy: 'system',
    } satisfies PlatformRestrictions);

  const risk = computeRisk({
    reasons: reports.map((r) => r.reason),
    previousViolations: user?.banCount ?? 0,
  });

  return {
    user: user ?? ({ id: userId, displayName: userId, status: 'active', banCount: 0 } as Partial<ModeratedUser>),
    risk,
    reports,
    warnings,
    restrictions,
    cases,
    removedContent: content.filter((c) => c.status === 'removed' || c.status === 'hidden'),
    appeals,
    audit: store.audit.filter((a) => a.targetId === userId).slice(0, 50),
  };
}

export function setUserCapabilities(input: {
  userId: string;
  capabilities: Partial<Record<PlatformCapability, boolean>>;
  reason: string;
  actor: string;
}) {
  if (!input.reason.trim()) throw new AppError('VALIDATION', 'reason required', 400);
  const store = readStore();
  const current =
    store.restrictions[input.userId]?.capabilities ??
    (Object.fromEntries(CAPABILITIES.map((c) => [c, true])) as Record<PlatformCapability, boolean>);
  const next = { ...current, ...input.capabilities };
  store.restrictions[input.userId] = {
    userId: input.userId,
    capabilities: next,
    reason: input.reason.trim(),
    updatedAt: now(),
    updatedBy: input.actor,
  };
  pushAudit(store, {
    admin: input.actor,
    action: 'user.restrict_capabilities',
    targetType: 'user',
    targetId: input.userId,
    newState: JSON.stringify(next),
    reason: input.reason.trim(),
  });
  writeStore(store);
  return store.restrictions[input.userId];
}

export function getAutoMod() {
  return readStore().autoMod;
}

export function setAutoMod(input: Partial<AutoModConfig> & { actor: string }) {
  const store = readStore();
  store.autoMod = {
    ...store.autoMod,
    ...input,
    autoPermanentBan: false,
    updatedAt: now(),
    updatedBy: input.actor,
  };
  pushAudit(store, {
    admin: input.actor,
    action: 'automod.update',
    targetType: 'automod',
    targetId: 'global',
    newState: JSON.stringify(store.autoMod),
    reason: 'Updated automated moderation',
  });
  writeStore(store);
  return store.autoMod;
}

export function listSafetyPolicies() {
  const store = readStore();
  return {
    active: store.policies.find((p) => p.id === store.activePolicyId) ?? store.policies[0],
    versions: store.policies,
  };
}

export function saveSafetyPolicyDraft(input: {
  actor: string;
  version: string;
  instruction: string;
  thresholds: SafetyPolicy['thresholds'];
  weights: Record<RiskSignal, number>;
}) {
  const store = readStore();
  const existing = store.policies.find((p) => p.version === input.version && p.status === 'DRAFT');
  const ts = now();
  if (existing) {
    existing.instruction = input.instruction;
    existing.thresholds = input.thresholds;
    existing.weights = input.weights;
    existing.updatedAt = ts;
    writeStore(store);
    return existing;
  }
  const draft: SafetyPolicy = {
    id: newId('spol'),
    version: input.version,
    status: 'DRAFT',
    instruction: input.instruction,
    thresholds: input.thresholds,
    weights: input.weights,
    createdAt: ts,
    updatedAt: ts,
    createdBy: input.actor,
  };
  store.policies = [draft, ...store.policies];
  pushAudit(store, {
    admin: input.actor,
    action: 'policy.draft',
    targetType: 'policy',
    targetId: draft.id,
    newState: draft.version,
    reason: 'Saved draft',
    policyVersion: draft.version,
  });
  writeStore(store);
  return draft;
}

export function setSafetyPolicyStatus(input: {
  policyId: string;
  status: PolicyStatus;
  actor: string;
}) {
  const store = readStore();
  const policy = store.policies.find((p) => p.id === input.policyId);
  if (!policy) throw new AppError('NOT_FOUND', 'Policy not found', 404);
  const prev = policy.status;
  if (input.status === 'ACTIVE') {
    for (const p of store.policies) {
      if (p.status === 'ACTIVE') p.status = 'ARCHIVED';
    }
    policy.status = 'ACTIVE';
    policy.publishedAt = now();
    store.activePolicyId = policy.id;
  } else if (input.status === 'ROLLED_BACK') {
    policy.status = 'ROLLED_BACK';
  } else {
    policy.status = input.status;
  }
  policy.updatedAt = now();
  pushAudit(store, {
    admin: input.actor,
    action: `policy.${input.status.toLowerCase()}`,
    targetType: 'policy',
    targetId: policy.id,
    previousState: prev,
    newState: policy.status,
    reason: `Policy ${policy.version}`,
    policyVersion: policy.version,
  });
  writeStore(store);
  return policy;
}

export function proposePolicyFromPrompt(input: { prompt: string; actor: string }) {
  if (!input.prompt.trim()) throw new AppError('VALIDATION', 'prompt required', 400);
  const store = readStore();
  const active = store.policies.find((p) => p.id === store.activePolicyId) ?? store.policies[0];
  const lower = input.prompt.toLowerCase();
  const thresholds = { ...active.thresholds };
  let expectedImpact = 'ปรับความไวปานกลาง';
  let risk = 'Low';
  if (/โอนเงิน|หลอก|scam|นอกระบบ/.test(lower)) {
    thresholds.scam = Math.min(95, thresholds.scam + 15);
    expectedImpact = 'Scam detection เข้มขึ้น · ส่ง Human Review เมื่อไม่มั่นใจ';
    risk = 'Medium';
  }
  if (/spam|ซ้ำ/.test(lower)) {
    thresholds.spam = Math.min(95, thresholds.spam + 10);
  }
  if (/อย่าแบน|ไม่แบน|human review/.test(lower)) {
    expectedImpact += ' · ไม่ auto-ban';
  }
  const proposal = {
    id: newId('prop'),
    prompt: input.prompt.trim(),
    proposed: {
      version: nextVersion(active.version),
      instruction: input.prompt.trim(),
      thresholds,
      weights: active.weights,
    },
    expectedImpact,
    risk,
    status: 'pending' as const,
    createdAt: now(),
    createdBy: input.actor,
  };
  store.proposedPolicies = [proposal, ...store.proposedPolicies].slice(0, 100);
  writeStore(store);
  return proposal;
}

export function decideProposedPolicy(input: {
  proposalId: string;
  decision: 'approved' | 'rejected';
  actor: string;
}) {
  const store = readStore();
  const p = store.proposedPolicies.find((x) => x.id === input.proposalId);
  if (!p) throw new AppError('NOT_FOUND', 'Proposal not found', 404);
  p.status = input.decision;
  if (input.decision === 'approved' && p.proposed.version && p.proposed.thresholds && p.proposed.weights) {
    saveSafetyPolicyDraft({
      actor: input.actor,
      version: String(p.proposed.version),
      instruction: String(p.proposed.instruction ?? p.prompt),
      thresholds: p.proposed.thresholds as SafetyPolicy['thresholds'],
      weights: p.proposed.weights as Record<RiskSignal, number>,
    });
  }
  writeStore(store);
  return p;
}

function nextVersion(v: string) {
  const m = v.match(/v(\d+)\.(\d+)/);
  if (!m) return 'v1.1';
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

export function listExtendedLists(kind?: ListKind) {
  const store = readStore();
  const social = listBlacklist().map((b) => ({
    id: b.id,
    kind: 'BLOCKLIST' as ListKind,
    type: 'user' as const,
    value: `${b.provider}:${b.providerUserId}`,
    reason: b.reason,
    createdAt: b.createdAt,
    createdBy: b.createdBy,
  }));
  const rows = [...store.lists, ...social];
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}

export function addListEntry(input: {
  kind: ListKind;
  type: ExtendedListEntry['type'];
  value: string;
  reason: string;
  actor: string;
}) {
  const store = readStore();
  const row: ExtendedListEntry = {
    id: newId('list'),
    kind: input.kind,
    type: input.type,
    value: input.value,
    reason: input.reason,
    createdAt: now(),
    createdBy: input.actor,
  };
  store.lists = [row, ...store.lists];
  pushAudit(store, {
    admin: input.actor,
    action: 'list.add',
    targetType: input.kind,
    targetId: row.id,
    newState: input.value,
    reason: input.reason,
  });
  writeStore(store);
  return row;
}

export function listAppeals(status?: string) {
  const store = readStore();
  if (!status || status === 'all') return store.appeals;
  return store.appeals.filter((a) => a.status === status);
}

export function createAppeal(input: {
  userId: string;
  targetType: Appeal['targetType'];
  targetId: string;
  originalAction: string;
  originalReason: string;
  appealText: string;
  evidence?: string;
}) {
  if (!input.appealText.trim()) throw new AppError('VALIDATION', 'appealText required', 400);
  const store = readStore();
  const appeal: Appeal = {
    id: newId('apl'),
    userId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    originalAction: input.originalAction,
    originalReason: input.originalReason,
    evidence: input.evidence,
    appealText: input.appealText.trim(),
    status: 'PENDING',
    createdAt: now(),
    updatedAt: now(),
  };
  store.appeals = [appeal, ...store.appeals];
  writeStore(store);
  return appeal;
}

export function decideAppeal(input: {
  appealId: string;
  decision: 'UPHELD' | 'MODIFIED' | 'REVERSED' | 'ESCALATED';
  actor: string;
  note?: string;
}) {
  const store = readStore();
  const a = store.appeals.find((x) => x.id === input.appealId);
  if (!a) throw new AppError('NOT_FOUND', 'Appeal not found', 404);
  const prev = a.status;
  a.status = input.decision;
  a.decisionNote = input.note;
  a.decidedBy = input.actor;
  a.updatedAt = now();
  pushAudit(store, {
    admin: input.actor,
    action: `appeal.${input.decision.toLowerCase()}`,
    targetType: 'appeal',
    targetId: a.id,
    previousState: prev,
    newState: a.status,
    reason: input.note || input.decision,
  });
  writeStore(store);
  return a;
}

export function listSafetyAudit(filters: {
  admin?: string;
  action?: string;
  targetType?: string;
  limit?: number;
}) {
  const store = readStore();
  const legacy = listAudit(100).map((a) => ({
    id: a.id,
    admin: a.actor,
    action: a.action,
    targetType: a.entityType,
    targetId: a.entityId,
    previousState: undefined as string | undefined,
    newState: undefined as string | undefined,
    reason: JSON.stringify(a.detail ?? {}),
    policyVersion: undefined as string | undefined,
    time: a.createdAt,
  }));
  let rows = [...store.audit, ...legacy];
  if (filters.admin) rows = rows.filter((r) => r.admin === filters.admin);
  if (filters.action) rows = rows.filter((r) => r.action.includes(filters.action!));
  if (filters.targetType) rows = rows.filter((r) => r.targetType === filters.targetType);
  return rows.slice(0, filters.limit ?? 100);
}

export function listProposedPolicies() {
  return readStore().proposedPolicies.filter((p) => p.status === 'pending');
}

function applyParsedRulesToAutoMod(
  store: StoreShape,
  parsed: ParsedModerationRules,
  actor: string,
  promptText: string,
) {
  store.autoMod = {
    ...store.autoMod,
    autoSoftLock: parsed.autoSoftLock,
    autoUnlock: parsed.autoUnlock,
    autoHide: parsed.autoHideContent,
    softLockRiskMin: parsed.softLockRiskMin,
    unlockRiskMax: parsed.unlockRiskMax,
    softLockHours: parsed.actionDurationHours,
    activeDirective: promptText,
    autoPermanentBan: false,
    updatedAt: now(),
    updatedBy: actor,
    spamProtection: parsed.categories.includes('SPAM')
      ? Math.max(store.autoMod.spamProtection, 70)
      : store.autoMod.spamProtection,
    scamDetection: parsed.categories.includes('FRAUD')
      ? Math.max(store.autoMod.scamDetection, 75)
      : store.autoMod.scamDetection,
  };
}

/** Admin chats a guideline → ModerationPolicy + algorithm run (no manual lock/unlock) */
export async function postAlgorithmDirective(input: { text: string; actor: string }) {
  if (!input.text.trim()) throw new AppError('VALIDATION', 'directive text required', 400);

  const { policy, source } = await createModerationPolicy({
    promptText: input.text,
    actor: input.actor,
  });
  const parsed = policy.parsedRules;

  const store = readStore();
  const row: AlgorithmDirective = {
    id: policy.id,
    text: policy.promptText,
    actor: input.actor,
    parsed: {
      autoSoftLock: parsed.autoSoftLock,
      autoUnlock: parsed.autoUnlock,
      softLockRiskMin: parsed.softLockRiskMin,
      unlockRiskMax: parsed.unlockRiskMax,
      softLockHours: parsed.actionDurationHours,
      scamDetection: parsed.categories.includes('FRAUD') ? 80 : undefined,
      spamProtection: parsed.categories.includes('SPAM') ? 75 : undefined,
      note: parsed.note,
    },
    createdAt: policy.createdAt,
  };
  store.directives = [row, ...store.directives.filter((d) => d.id !== row.id)].slice(0, 200);
  applyParsedRulesToAutoMod(store, parsed, input.actor, policy.promptText);
  pushAudit(store, {
    admin: input.actor,
    action: 'algorithm.directive',
    targetType: 'algorithm',
    targetId: row.id,
    newState: JSON.stringify({ ...parsed, source }),
    reason: input.text.trim(),
  });
  writeStore(store);

  const run = await runLockUnlockAlgorithm({ actor: input.actor, trigger: 'directive' });
  return { directive: row, policy, autoMod: store.autoMod, run, source };
}

export function listAlgorithmDirectives(limit = 30) {
  return readStore().directives.slice(0, limit);
}

export function listAlgorithmRuns(limit = 20) {
  return readStore().algorithmRuns.slice(0, limit);
}

export async function getAlgorithmStatus() {
  const store = readStore();
  const policies = await listModerationPolicies(5);
  const states = await listModerationStates(20);
  const active = policies.find((p) => p.isActive) ?? null;
  return {
    autoMod: store.autoMod,
    latestDirective: store.directives[0] ?? null,
    latestRun: store.algorithmRuns[0] ?? null,
    activePolicy: active,
    moderationStates: states.filter(
      (s) => s.status === 'SOFT_LOCKED' || s.status === 'AUTO_HIDDEN',
    ),
    rules: {
      requireUserReport: true,
      appleGuideline: '1.2',
      autoPermanentBan: false,
      autoHardDelete: false,
      statuses: ['ACTIVE', 'SOFT_LOCKED', 'AUTO_HIDDEN'],
      description:
        'แอดมินกำหนดแนวทาง NL → อัลกอริทึม soft-lock / AUTO_HIDDEN / unlock เมื่อมีรายงานจากผู้ใช้',
    },
  };
}

/**
 * Core algorithm: soft-lock / unlock without admin clicking each account.
 * Hard ban / permanent delete are NEVER automatic.
 */
export async function runLockUnlockAlgorithm(input?: {
  actor?: string;
  trigger?: string;
}): Promise<AlgorithmRunResult> {
  const actor = input?.actor ?? 'algorithm';
  const engine: EngineRunResult = await runDynamicModerationEngine({
    actor,
    trigger: input?.trigger,
  });

  // Keep AutoMod in sync when engine used defaults from active policy
  const store = readStore();
  if (engine.directive) {
    const parsed = parseNaturalLanguagePolicy(engine.directive);
    applyParsedRulesToAutoMod(store, parsed, actor, engine.directive);
  }

  const result: AlgorithmRunResult = {
    id: engine.id,
    at: engine.at,
    locked: engine.locked,
    unlocked: engine.unlocked.map((u) => ({
      userId: u.targetId,
      reason: `${u.targetType}:${u.reason}`,
    })),
    skipped: [
      ...engine.skipped,
      ...engine.hidden.map((h) => ({
        userId: h.contentId,
        reportId: h.reportId,
        reason: `AUTO_HIDDEN risk=${h.risk}`,
      })),
    ].slice(0, 100),
    directive: engine.directive ?? store.autoMod.activeDirective,
  };

  store.algorithmRuns = [result, ...store.algorithmRuns].slice(0, 100);
  pushAudit(store, {
    admin: actor,
    action: 'algorithm.run',
    targetType: 'algorithm',
    targetId: result.id,
    newState: `locked=${result.locked.length} hidden=${engine.hidden.length} unlocked=${result.unlocked.length} source=${engine.source}`,
    reason: input?.trigger ?? 'manual_or_report',
  });
  writeStore(store);
  return result;
}

export { CAPABILITIES, listModerationPolicies, listModerationStates, parseNaturalLanguagePolicy };
