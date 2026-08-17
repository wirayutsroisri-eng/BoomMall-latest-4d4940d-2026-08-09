import { getActor, getApiKey } from './api';

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);
  headers.set('X-Admin-Actor', getActor());
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    const err = new Error(json?.error?.message ?? `HTTP ${res.status}`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = json?.error?.code;
    throw err;
  }
  return json as T;
}

export type SafetyOverview = {
  newReports: number;
  criticalCases: number;
  pendingReview: number;
  autoHidden: number;
  bannedUsers: number;
  restrictedUsers: number;
  appealsPending: number;
  spamAlerts: number;
  scamAlerts: number;
  chatAbuseAlerts: number;
  trends: {
    today: { reports: number; cases: number; appeals: number };
    days7: { reports: number; cases: number; appeals: number };
    days30: { reports: number; cases: number; appeals: number };
  };
  generatedAt: string;
};

export type SafetyReportRow = {
  id: string;
  kind: string;
  targetId: string;
  targetLabel?: string;
  reason: string;
  details?: string;
  reporterRef?: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  riskScore: number;
  riskBand: string;
  riskSignals: Array<{ signal: string; weight: number; contribution: number }>;
  reportCount: number;
};

export type SafetyCase = {
  id: string;
  userId?: string;
  contentId?: string;
  reportIds: string[];
  previousViolations: number;
  risk: {
    score: number;
    band: string;
    signals: Array<{ signal: string; weight: number; contribution: number }>;
  };
  aiRecommendation?: {
    action: string;
    confidence: number;
    reason: string;
    policyMatched: string;
  };
  moderator?: string;
  status: string;
  timeline: Array<{ at: string; actor: string; event: string; detail?: string }>;
  createdAt: string;
  updatedAt: string;
};

export type Appeal = {
  id: string;
  userId: string;
  targetType: string;
  targetId: string;
  originalAction: string;
  originalReason: string;
  appealText: string;
  evidence?: string;
  status: string;
  decisionNote?: string;
  decidedBy?: string;
  createdAt: string;
};

export type SafetyPolicy = {
  id: string;
  version: string;
  status: string;
  instruction: string;
  thresholds: { spam: number; scam: number; harassment: number; illegalGoods: number };
  weights: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type AutoMod = {
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
  autoSoftLock?: boolean;
  autoUnlock?: boolean;
  softLockRiskMin?: number;
  unlockRiskMax?: number;
  softLockHours?: number;
  activeDirective?: string;
  autoPermanentBan: false;
};

export type AlgorithmStatus = {
  autoMod: AutoMod;
  latestDirective: { id: string; text: string; actor: string; createdAt: string } | null;
  latestRun: {
    id: string;
    at: string;
    locked: unknown[];
    unlocked: unknown[];
    skipped: unknown[];
  } | null;
  activePolicy?: {
    id: string;
    promptText: string;
    parsedRules: Record<string, unknown>;
    isActive: boolean;
  } | null;
  moderationStates?: Array<{
    targetId: string;
    targetType: string;
    status: string;
    currentRiskScore: number;
    autoUnlockAt?: string | null;
  }>;
  rules: {
    requireUserReport: boolean;
    appleGuideline: string;
    autoPermanentBan: boolean;
    autoHardDelete: boolean;
    statuses?: string[];
    description: string;
  };
};

export function fetchSafetyOverview() {
  return req<{ ok: true; data: SafetyOverview }>('/api/v1/admin/safety/overview');
}

export function fetchSafetyReports(params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  const qs = q.toString();
  return req<{ ok: true; data: SafetyReportRow[] }>(
    `/api/v1/admin/safety/reports${qs ? `?${qs}` : ''}`,
  );
}

export function fetchSafetyCases(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return req<{ ok: true; data: SafetyCase[] }>(`/api/v1/admin/safety/cases${q}`);
}

export function createSafetyCase(reportIds: string[], userId?: string) {
  return req<{ ok: true; data: SafetyCase }>('/api/v1/admin/safety/cases', {
    method: 'POST',
    body: JSON.stringify({ reportIds, userId }),
  });
}

export function actSafetyCase(
  caseId: string,
  action: string,
  note?: string,
  aiDecision?: string,
) {
  return req<{ ok: true; data: SafetyCase }>(
    `/api/v1/admin/safety/cases/${encodeURIComponent(caseId)}/action`,
    { method: 'POST', body: JSON.stringify({ action, note, aiDecision }) },
  );
}

export function fetchUserSafetyProfile(userId: string) {
  return req<{ ok: true; data: Record<string, unknown> }>(
    `/api/v1/admin/safety/users/${encodeURIComponent(userId)}/profile`,
  );
}

export function updateUserCapabilities(
  userId: string,
  capabilities: Record<string, boolean>,
  reason: string,
) {
  return req<{ ok: true; data: unknown }>(
    `/api/v1/admin/safety/users/${encodeURIComponent(userId)}/capabilities`,
    { method: 'POST', body: JSON.stringify({ capabilities, reason }) },
  );
}

export function fetchAutoMod() {
  return req<{ ok: true; data: AutoMod }>('/api/v1/admin/safety/automod');
}

export function saveAutoMod(payload: Partial<AutoMod>) {
  return req<{ ok: true; data: AutoMod }>('/api/v1/admin/safety/automod', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchSafetyPolicies() {
  return req<{ ok: true; data: { active: SafetyPolicy; versions: SafetyPolicy[] } }>(
    '/api/v1/admin/safety/policy',
  );
}

export function saveSafetyPolicyDraft(payload: {
  version: string;
  instruction: string;
  thresholds: SafetyPolicy['thresholds'];
  weights: Record<string, number>;
}) {
  return req<{ ok: true; data: SafetyPolicy }>('/api/v1/admin/safety/policy/draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setSafetyPolicyStatus(policyId: string, status: string) {
  return req<{ ok: true; data: SafetyPolicy }>(
    `/api/v1/admin/safety/policy/${encodeURIComponent(policyId)}/status`,
    { method: 'POST', body: JSON.stringify({ status }) },
  );
}

export function proposeSafetyPolicy(prompt: string) {
  return req<{ ok: true; data: unknown }>('/api/v1/admin/safety/policy/prompt', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

export function fetchPolicyProposals() {
  return req<{ ok: true; data: unknown[] }>('/api/v1/admin/safety/policy/proposals');
}

export function decidePolicyProposal(id: string, decision: 'approved' | 'rejected') {
  return req<{ ok: true; data: unknown }>(
    `/api/v1/admin/safety/policy/proposals/${encodeURIComponent(id)}/decision`,
    { method: 'POST', body: JSON.stringify({ decision }) },
  );
}

export function fetchSafetyLists(kind?: string) {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return req<{ ok: true; data: unknown[] }>(`/api/v1/admin/safety/lists${q}`);
}

export function addSafetyListEntry(payload: {
  kind: string;
  type: string;
  value: string;
  reason: string;
}) {
  return req<{ ok: true; data: unknown }>('/api/v1/admin/safety/lists', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchAppeals(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return req<{ ok: true; data: Appeal[] }>(`/api/v1/admin/safety/appeals${q}`);
}

export function decideAppeal(id: string, decision: string, note?: string) {
  return req<{ ok: true; data: Appeal }>(
    `/api/v1/admin/safety/appeals/${encodeURIComponent(id)}/decision`,
    { method: 'POST', body: JSON.stringify({ decision, note }) },
  );
}

export function fetchSafetyAudit(params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  const qs = q.toString();
  return req<{ ok: true; data: unknown[] }>(`/api/v1/admin/safety/audit${qs ? `?${qs}` : ''}`);
}

export function fetchAlgorithmStatus() {
  return req<{ ok: true; data: AlgorithmStatus }>('/api/v1/admin/safety/algorithm');
}

export function fetchAlgorithmDirectives() {
  return req<{ ok: true; data: unknown[] }>('/api/v1/admin/safety/algorithm/directives');
}

export function fetchAlgorithmRuns() {
  return req<{ ok: true; data: unknown[] }>('/api/v1/admin/safety/algorithm/runs');
}

export function postAlgorithmDirective(text: string) {
  return req<{ ok: true; data: unknown }>('/api/v1/admin/safety/algorithm/directive', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function runSafetyAlgorithm() {
  return req<{ ok: true; data: unknown }>('/api/v1/admin/safety/algorithm/run', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
