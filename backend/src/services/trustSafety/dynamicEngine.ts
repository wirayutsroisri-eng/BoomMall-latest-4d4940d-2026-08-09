/**
 * Dynamic Moderation Engine — NL policy parser + auto soft-lock/unlock.
 * Guardrail: NEVER hard ban / hard delete from the algorithm (App Store 1.2).
 *
 * Persistence: Prisma ModerationPolicy / ModerationState when DB is up,
 * otherwise JSON fallback under data/moderation-engine.json.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import {
  algorithmSoftLockUser,
  listReports,
  listUsers,
  restoreContent,
  setContentStatus,
  unlockUser,
  type ModerationReport,
} from '../moderation';
import { computeRisk } from './risk';

export type ModerationTargetType = 'USER' | 'POST';
export type ModerationStateStatus =
  | 'ACTIVE'
  | 'SOFT_LOCKED'
  | 'AUTO_HIDDEN'
  | 'PENDING_REVIEW'
  | 'BANNED';

export type ParsedModerationRules = {
  reportThreshold: number;
  actionDurationHours: number;
  categories: string[];
  autoSoftLock: boolean;
  autoUnlock: boolean;
  autoHideContent: boolean;
  softLockRiskMin: number;
  unlockRiskMax: number;
  riskDecayPerHour: number;
  /** Always true — algorithm cannot hard-ban */
  forbidHardBan: true;
  forbidHardDelete: true;
  note: string;
};

export type ModerationPolicyRow = {
  id: string;
  promptText: string;
  parsedRules: ParsedModerationRules;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ModerationStateRow = {
  id: string;
  targetType: ModerationTargetType;
  targetId: string;
  currentRiskScore: number;
  status: ModerationStateStatus;
  softLockedAt?: string | null;
  autoUnlockAt?: string | null;
  lockReason?: string | null;
  lastReportId?: string | null;
  policyId?: string | null;
  updatedAt: string;
};

export type EngineRunResult = {
  id: string;
  at: string;
  locked: Array<{ userId: string; reportId: string; risk: number; reason: string }>;
  hidden: Array<{ contentId: string; reportId: string; risk: number }>;
  unlocked: Array<{ targetId: string; targetType: ModerationTargetType; reason: string }>;
  skipped: Array<{ userId?: string; reportId?: string; reason: string }>;
  policyId?: string;
  directive?: string;
  source: 'prisma' | 'json';
};

type FallbackStore = {
  policies: ModerationPolicyRow[];
  states: ModerationStateRow[];
};

const DATA_DIR = path.join(process.cwd(), 'data');
const FALLBACK_FILE = path.join(DATA_DIR, 'moderation-engine.json');

const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/spam|สแปม|ซ้ำ/, 'SPAM'],
  [/scam|หลอก|โอนเงิน|fraud|นอกระบบ|promptpay/, 'FRAUD'],
  [/harass|คุกคาม|ด่า/, 'HARASSMENT'],
  [/sex|โป๊|18\+/, 'SEXUAL'],
  [/violence|ฆ่า|ทำร้าย/, 'VIOLENCE'],
  [/ยา|พนัน|illegal|ของผิดกฏหมาย/, 'ILLEGAL'],
  [/ปลอม|impersonat/, 'IMPERSONATION'],
  [/bot|หุ่นยนต์/, 'BOT'],
];

function iso(d: Date | string = new Date()) {
  return typeof d === 'string' ? d : d.toISOString();
}

function emptyFallback(): FallbackStore {
  return { policies: [], states: [] };
}

function readFallback(): FallbackStore {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) return emptyFallback();
    const raw = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8')) as FallbackStore;
    return {
      policies: Array.isArray(raw.policies) ? raw.policies : [],
      states: Array.isArray(raw.states) ? raw.states : [],
    };
  } catch {
    return emptyFallback();
  }
}

function writeFallback(store: FallbackStore) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function prismaEngineReady(): Promise<boolean> {
  try {
    await prisma.moderationPolicy.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

/** Parse admin natural-language guidelines into executable rules */
export function parseNaturalLanguagePolicy(text: string): ParsedModerationRules {
  const t = text.toLowerCase();
  const noteParts: string[] = [text.trim()];

  const categories = CATEGORY_PATTERNS.filter(([re]) => re.test(t)).map(([, c]) => c);
  if (categories.length === 0) {
    categories.push('SPAM', 'FRAUD');
    noteParts.push('categories default SPAM+FRAUD');
  }

  let reportThreshold = 1;
  const thr =
    t.match(/(?:เกิน|มากกว่า|>)\s*(\d+)/)?.[1] ??
    t.match(/(\d+)\s*(?:ครั้ง|reports?|ราย)/)?.[1];
  if (thr) {
    reportThreshold = Math.max(1, Number(thr));
    noteParts.push(`reportThreshold=${reportThreshold}`);
  } else if (/เยอะ|มาก|บ่อย/.test(t)) {
    reportThreshold = 2;
    noteParts.push('reportThreshold=2 (เยอะ)');
  }

  let actionDurationHours = 24;
  if (/48.?ชม|สองวัน|2.?day/.test(t)) actionDurationHours = 48;
  else if (/12.?ชม/.test(t)) actionDurationHours = 12;
  else if (/6.?ชม/.test(t)) actionDurationHours = 6;
  else if (/72.?ชม|3.?day|สามวัน/.test(t)) actionDurationHours = 72;
  else if (/24.?ชม|หนึ่งวัน|1.?day|ชั่วโมง/.test(t)) actionDurationHours = 24;

  let autoSoftLock = true;
  let autoUnlock = true;
  let autoHideContent = true;
  let softLockRiskMin = 65;
  let unlockRiskMax = 35;
  const riskDecayPerHour = 2;

  if (/ปิด.?ล็อก.?อัตโนมัติ|หยุด.?ล็อก|อย่า.?ล็อก.?เอง|disable.?auto.?lock/.test(t)) {
    autoSoftLock = false;
    noteParts.push('autoSoftLock=OFF');
  } else if (/ล็อก.?อัตโนมัติ|เปิด.?ล็อก.?เอง|soft.?lock|auto.?lock|ให้ระบบ.?ล็อก/.test(t)) {
    autoSoftLock = true;
    noteParts.push('autoSoftLock=ON');
  }

  if (/ปิด.?ปลด|อย่า.?ปลด.?เอง|disable.?auto.?unlock/.test(t)) {
    autoUnlock = false;
    noteParts.push('autoUnlock=OFF');
  } else if (/ปลด.?ล็อก.?อัตโนมัติ|ปลด.?เอง|auto.?unlock|ให้ระบบ.?ปลด/.test(t)) {
    autoUnlock = true;
    noteParts.push('autoUnlock=ON');
  }

  if (/ปิด.?ซ่อน|อย่า.?ซ่อน.?เอง|disable.?auto.?hide/.test(t)) {
    autoHideContent = false;
  } else if (/ซ่อน.?อัตโนมัติ|auto.?hide|AUTO_HIDDEN/.test(t)) {
    autoHideContent = true;
  }

  if (/เข้ม|โอนเงิน|หลอก|scam|fraud/.test(t)) {
    softLockRiskMin = 55;
    noteParts.push('เข้ม · softLockRiskMin=55');
  }
  if (/ผ่อน|ไม่เข้ม|ลดเกณฑ์/.test(t)) {
    softLockRiskMin = 80;
    unlockRiskMax = 50;
    noteParts.push('ผ่อนเกณฑ์');
  }

  if (/ห้าม.?แบน.?ถาวร|อย่า.?แบน.?ถาวร|no.?permanent|ห้าม.?hard/.test(t)) {
    noteParts.push('ยืนยันห้าม permanent ban จากอัลกอริทึม');
  }

  return {
    reportThreshold,
    actionDurationHours,
    categories: [...new Set(categories)],
    autoSoftLock,
    autoUnlock,
    autoHideContent,
    softLockRiskMin,
    unlockRiskMax,
    riskDecayPerHour,
    forbidHardBan: true,
    forbidHardDelete: true,
    note: noteParts.join(' · '),
  };
}

function reportMatchesCategories(report: ModerationReport, categories: string[]): boolean {
  if (!categories.length) return true;
  const text = `${report.reason} ${report.details ?? ''}`.toLowerCase();
  return categories.some((cat) => {
    const re = CATEGORY_PATTERNS.find(([, c]) => c === cat)?.[0];
    return re ? re.test(text) : text.includes(cat.toLowerCase());
  });
}

function decayRisk(state: ModerationStateRow | null, rules: ParsedModerationRules): number {
  if (!state) return 0;
  const hours = Math.max(
    0,
    (Date.now() - new Date(state.updatedAt).getTime()) / 3600_000,
  );
  return Math.max(0, state.currentRiskScore - hours * rules.riskDecayPerHour);
}

function mergeActiveRules(policies: ModerationPolicyRow[]): ParsedModerationRules | null {
  const active = policies.filter((p) => p.isActive);
  if (!active.length) return null;
  const latest = active[0]!;
  const cats = new Set<string>();
  for (const p of active) {
    for (const c of p.parsedRules.categories) cats.add(c);
  }
  return {
    ...latest.parsedRules,
    categories: [...cats],
    forbidHardBan: true,
    forbidHardDelete: true,
  };
}

function mapPrismaPolicy(row: {
  id: string;
  promptText: string;
  parsedRules: unknown;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ModerationPolicyRow {
  return {
    id: row.id,
    promptText: row.promptText,
    parsedRules: row.parsedRules as ParsedModerationRules,
    isActive: row.isActive,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function mapPrismaState(row: {
  id: string;
  targetType: string;
  targetId: string;
  currentRiskScore: number;
  status: string;
  softLockedAt: Date | null;
  autoUnlockAt: Date | null;
  lockReason: string | null;
  lastReportId: string | null;
  policyId: string | null;
  updatedAt: Date;
}): ModerationStateRow {
  return {
    id: row.id,
    targetType: row.targetType as ModerationTargetType,
    targetId: row.targetId,
    currentRiskScore: row.currentRiskScore,
    status: row.status as ModerationStateStatus,
    softLockedAt: row.softLockedAt ? iso(row.softLockedAt) : null,
    autoUnlockAt: row.autoUnlockAt ? iso(row.autoUnlockAt) : null,
    lockReason: row.lockReason,
    lastReportId: row.lastReportId,
    policyId: row.policyId,
    updatedAt: iso(row.updatedAt),
  };
}

export async function createModerationPolicy(input: {
  promptText: string;
  actor: string;
}): Promise<{ policy: ModerationPolicyRow; source: 'prisma' | 'json' }> {
  const promptText = input.promptText.trim();
  if (!promptText) throw new Error('promptText required');
  const parsedRules = parseNaturalLanguagePolicy(promptText);
  const id = randomUUID();
  const ts = new Date();

  if (await prismaEngineReady()) {
    await prisma.moderationPolicy.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    const row = await prisma.moderationPolicy.create({
      data: {
        id,
        promptText,
        parsedRules,
        isActive: true,
        createdBy: input.actor,
      },
    });
    return { policy: mapPrismaPolicy(row), source: 'prisma' };
  }

  const store = readFallback();
  for (const p of store.policies) p.isActive = false;
  const policy: ModerationPolicyRow = {
    id,
    promptText,
    parsedRules,
    isActive: true,
    createdBy: input.actor,
    createdAt: iso(ts),
    updatedAt: iso(ts),
  };
  store.policies = [policy, ...store.policies].slice(0, 200);
  writeFallback(store);
  return { policy, source: 'json' };
}

export async function listModerationPolicies(limit = 30): Promise<ModerationPolicyRow[]> {
  if (await prismaEngineReady()) {
    const rows = await prisma.moderationPolicy.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapPrismaPolicy);
  }
  return readFallback().policies.slice(0, limit);
}

export async function listModerationStates(limit = 100): Promise<ModerationStateRow[]> {
  if (await prismaEngineReady()) {
    const rows = await prisma.moderationState.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map(mapPrismaState);
  }
  return readFallback().states.slice(0, limit);
}

async function upsertState(
  patch: Omit<ModerationStateRow, 'id' | 'updatedAt'> & { id?: string },
  usePrisma: boolean,
): Promise<ModerationStateRow> {
  const updatedAt = iso();
  if (usePrisma) {
    const row = await prisma.moderationState.upsert({
      where: { targetId: patch.targetId },
      create: {
        id: patch.id ?? randomUUID(),
        targetType: patch.targetType,
        targetId: patch.targetId,
        currentRiskScore: patch.currentRiskScore,
        status: patch.status,
        softLockedAt: patch.softLockedAt ? new Date(patch.softLockedAt) : null,
        autoUnlockAt: patch.autoUnlockAt ? new Date(patch.autoUnlockAt) : null,
        lockReason: patch.lockReason ?? null,
        lastReportId: patch.lastReportId ?? null,
        policyId: patch.policyId ?? null,
      },
      update: {
        targetType: patch.targetType,
        currentRiskScore: patch.currentRiskScore,
        status: patch.status,
        softLockedAt: patch.softLockedAt ? new Date(patch.softLockedAt) : null,
        autoUnlockAt: patch.autoUnlockAt ? new Date(patch.autoUnlockAt) : null,
        lockReason: patch.lockReason ?? null,
        lastReportId: patch.lastReportId ?? null,
        policyId: patch.policyId ?? null,
      },
    });
    return mapPrismaState(row);
  }

  const store = readFallback();
  const existing = store.states.find((s) => s.targetId === patch.targetId);
  const row: ModerationStateRow = {
    id: existing?.id ?? patch.id ?? randomUUID(),
    targetType: patch.targetType,
    targetId: patch.targetId,
    currentRiskScore: patch.currentRiskScore,
    status: patch.status,
    softLockedAt: patch.softLockedAt ?? null,
    autoUnlockAt: patch.autoUnlockAt ?? null,
    lockReason: patch.lockReason ?? null,
    lastReportId: patch.lastReportId ?? null,
    policyId: patch.policyId ?? null,
    updatedAt,
  };
  store.states = [row, ...store.states.filter((s) => s.targetId !== patch.targetId)].slice(0, 5000);
  writeFallback(store);
  return row;
}

async function getState(targetId: string, usePrisma: boolean): Promise<ModerationStateRow | null> {
  if (usePrisma) {
    const row = await prisma.moderationState.findUnique({ where: { targetId } });
    return row ? mapPrismaState(row) : null;
  }
  return readFallback().states.find((s) => s.targetId === targetId) ?? null;
}

/**
 * Core algorithm: soft-lock / AUTO_HIDDEN / unlock from active NL policies.
 * Hard ban / hard delete are NEVER executed here.
 */
export async function runDynamicModerationEngine(input?: {
  actor?: string;
  trigger?: string;
  policyId?: string;
}): Promise<EngineRunResult> {
  const actor = input?.actor ?? 'algorithm';
  const usePrisma = await prismaEngineReady();
  const policies = usePrisma
    ? (
        await prisma.moderationPolicy.findMany({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        })
      ).map(mapPrismaPolicy)
    : readFallback().policies.filter((p) => p.isActive);

  const rules = mergeActiveRules(policies);
  const locked: EngineRunResult['locked'] = [];
  const hidden: EngineRunResult['hidden'] = [];
  const unlocked: EngineRunResult['unlocked'] = [];
  const skipped: EngineRunResult['skipped'] = [];

  if (!rules) {
    // Bootstrap from default NL so engine works before first admin chat
    const seeded = await createModerationPolicy({
      promptText:
        'ล็อกชั่วคราวอัตโนมัติเมื่อมีรายงานจากผู้ใช้และคะแนนความเสี่ยงสูง — ปลดล็อกเองเมื่อครบเวลาหรือความเสี่ยงลด ห้ามแบนถาวรโดยอัลกอริทึม',
      actor: input?.actor ?? 'system',
    });
    return runDynamicModerationEngine({
      ...input,
      policyId: seeded.policy.id,
    });
  }

  if (!rules.forbidHardBan || !rules.forbidHardDelete) {
    throw new Error('GUARDRAIL: algorithm must forbid hard ban/delete');
  }

  const reports = listReports('all').filter((r) => r.status === 'open' || r.status === 'reviewed');
  const users = listUsers();
  const policyId = policies[0]?.id;
  const directive = policies[0]?.promptText;

  const byTarget = new Map<string, ModerationReport[]>();
  for (const r of reports) {
    if (!reportMatchesCategories(r, rules.categories)) continue;
    const list = byTarget.get(r.targetId) ?? [];
    list.push(r);
    byTarget.set(r.targetId, list);
  }

  for (const [targetId, targetReports] of byTarget) {
    if (targetReports.length < rules.reportThreshold) {
      skipped.push({
        userId: targetId,
        reportId: targetReports[0]?.id,
        reason: `reports ${targetReports.length} < threshold ${rules.reportThreshold}`,
      });
      continue;
    }

    const sample = targetReports[0]!;
    const isContent =
      sample.kind === 'content' || sample.kind === 'comment' || sample.kind === 'message';
    const targetType: ModerationTargetType = isContent ? 'POST' : 'USER';
    const prev = await getState(targetId, usePrisma);
    const baseRisk = computeRisk({
      reasons: targetReports.flatMap((r) => [r.reason, r.details ?? '']).concat(directive ?? ''),
      previousViolations: users.find((u) => u.id === targetId)?.banCount ?? 0,
    });
    const decayed = decayRisk(prev, rules);
    // Report volume boost — NL thresholds (e.g. "เกิน 3 ครั้ง") are the primary gate
    let riskScore = Math.min(
      100,
      baseRisk.score + targetReports.length * 18 + decayed * 0.25,
    );
    if (baseRisk.signals.length > 0) {
      riskScore = Math.max(riskScore, rules.softLockRiskMin);
    }

    if (riskScore < rules.softLockRiskMin) {
      skipped.push({
        userId: targetId,
        reportId: sample.id,
        reason: `risk ${riskScore.toFixed(1)} < softLockRiskMin ${rules.softLockRiskMin}`,
      });
      await upsertState(
        {
          targetType,
          targetId,
          currentRiskScore: riskScore,
          status:
            prev?.status === 'SOFT_LOCKED' || prev?.status === 'AUTO_HIDDEN'
              ? prev.status
              : 'ACTIVE',
          softLockedAt: prev?.softLockedAt,
          autoUnlockAt: prev?.autoUnlockAt,
          lockReason: prev?.lockReason,
          lastReportId: sample.id,
          policyId,
        },
        usePrisma,
      );
      continue;
    }

    const softLockedAt = iso();
    const autoUnlockAt = iso(new Date(Date.now() + rules.actionDurationHours * 3600_000));

    if (targetType === 'POST' && rules.autoHideContent) {
      if (prev?.status === 'AUTO_HIDDEN') {
        skipped.push({ userId: targetId, reportId: sample.id, reason: 'already AUTO_HIDDEN' });
        continue;
      }
      setContentStatus({
        contentId: targetId,
        status: 'hidden',
        reason: `algorithm AUTO_HIDDEN · risk ${riskScore.toFixed(0)} · ${sample.reason}`,
        actor,
        relatedReportId: sample.id,
        auto: true,
      });
      await upsertState(
        {
          targetType: 'POST',
          targetId,
          currentRiskScore: riskScore,
          status: 'AUTO_HIDDEN',
          softLockedAt,
          autoUnlockAt,
          lockReason: `AUTO_HIDDEN · ${sample.reason}`,
          lastReportId: sample.id,
          policyId,
        },
        usePrisma,
      );
      hidden.push({ contentId: targetId, reportId: sample.id, risk: riskScore });
      continue;
    }

    if (targetType === 'USER' && rules.autoSoftLock) {
      const existing = users.find((u) => u.id === targetId);
      if (existing?.status === 'banned' || existing?.status === 'hard_deleted') {
        skipped.push({
          userId: targetId,
          reportId: sample.id,
          reason: `status=${existing.status} · algorithm never hard-bans`,
        });
        continue;
      }
      try {
        const result = algorithmSoftLockUser({
          userId: targetId,
          actor,
          reason: `อัลกอริทึม SOFT_LOCKED · risk ${riskScore.toFixed(0)} (${baseRisk.band}) · ${sample.reason}`,
          reportId: sample.id,
        });
        if (!result.applied) {
          skipped.push({ userId: targetId, reportId: sample.id, reason: result.reason });
          continue;
        }
        await upsertState(
          {
            targetType: 'USER',
            targetId,
            currentRiskScore: riskScore,
            status: 'SOFT_LOCKED',
            softLockedAt,
            autoUnlockAt,
            lockReason: sample.reason,
            lastReportId: sample.id,
            policyId,
          },
          usePrisma,
        );
        locked.push({
          userId: targetId,
          reportId: sample.id,
          risk: riskScore,
          reason: baseRisk.signals.map((s) => s.signal).join(',') || sample.reason,
        });
      } catch (e) {
        skipped.push({
          userId: targetId,
          reportId: sample.id,
          reason: e instanceof Error ? e.message : 'soft-lock failed',
        });
      }
    } else if (!rules.autoSoftLock) {
      skipped.push({ reason: 'autoSoftLock disabled by NL policy' });
    }
  }

  if (rules.autoUnlock) {
    const states = usePrisma
      ? (
          await prisma.moderationState.findMany({
            where: { status: { in: ['SOFT_LOCKED', 'AUTO_HIDDEN'] } },
          })
        ).map(mapPrismaState)
      : readFallback().states.filter(
          (s) => s.status === 'SOFT_LOCKED' || s.status === 'AUTO_HIDDEN',
        );

    for (const state of states) {
      const effectiveRisk = decayRisk(state, rules);
      const unlockDue =
        state.autoUnlockAt != null && new Date(state.autoUnlockAt).getTime() <= Date.now();
      const riskOk = effectiveRisk <= rules.unlockRiskMax;

      if (!unlockDue && !riskOk) {
        skipped.push({
          userId: state.targetId,
          reason: `still locked · unlockDue=${unlockDue} riskOk=${riskOk} risk=${effectiveRisk.toFixed(1)}`,
        });
        await upsertState({ ...state, currentRiskScore: effectiveRisk }, usePrisma);
        continue;
      }

      const reason = unlockDue
        ? `อัลกอริทึมปลด · ครบ ${rules.actionDurationHours} ชม.`
        : `อัลกอริทึมปลด · risk ลดเหลือ ${effectiveRisk.toFixed(0)}`;

      try {
        if (state.targetType === 'USER') {
          unlockUser({
            userId: state.targetId,
            actor,
            reason,
            reportId: state.lastReportId ?? undefined,
          });
        } else {
          restoreContent(state.targetId, actor);
        }
        await upsertState(
          {
            targetType: state.targetType,
            targetId: state.targetId,
            currentRiskScore: effectiveRisk,
            status: 'ACTIVE',
            softLockedAt: null,
            autoUnlockAt: null,
            lockReason: null,
            lastReportId: state.lastReportId,
            policyId: state.policyId,
          },
          usePrisma,
        );
        unlocked.push({
          targetId: state.targetId,
          targetType: state.targetType,
          reason: unlockDue
            ? `timer ${rules.actionDurationHours}h`
            : `risk ${effectiveRisk.toFixed(0)}`,
        });
      } catch (e) {
        skipped.push({
          userId: state.targetId,
          reason: e instanceof Error ? e.message : 'unlock failed',
        });
      }
    }
  }

  return {
    id: randomUUID(),
    at: iso(),
    locked,
    hidden,
    unlocked,
    skipped: skipped.slice(0, 100),
    policyId,
    directive,
    source: usePrisma ? 'prisma' : 'json',
  };
}
