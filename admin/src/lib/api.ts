const API_KEY_STORAGE = 'boommall.admin.apiKey';
const ACTOR_STORAGE = 'boommall.admin.actor';
const ROLE_STORAGE = 'boommall.admin.role';

export type AdminRole = 'ADMIN';

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) ?? '';
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
  localStorage.removeItem(ROLE_STORAGE);
}

export function getActor() {
  return localStorage.getItem(ACTOR_STORAGE) ?? 'admin';
}

export function setActor(actor: string) {
  localStorage.setItem(ACTOR_STORAGE, actor);
}

export function getStoredRole(): AdminRole | null {
  const r = localStorage.getItem(ROLE_STORAGE);
  return r === 'ADMIN' ? 'ADMIN' : null;
}

export function setStoredRole(role: AdminRole | null) {
  if (role) localStorage.setItem(ROLE_STORAGE, role);
  else localStorage.removeItem(ROLE_STORAGE);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = json?.error?.code;
    throw err;
  }
  return json as T;
}

export type AdminSession = {
  actor: string;
  role: AdminRole;
  permissions: {
    dashboard: boolean;
    topupApprove: boolean;
    handbook: boolean;
    ledgerReconcile: boolean;
    moderation?: boolean;
  };
  issuedAt: string;
};

export async function fetchAdminSession() {
  return request<{ ok: true; data: AdminSession }>('/api/v1/admin/me');
}

export async function fetchHandbookAccess() {
  return request<{ ok: true; data: { allowed: boolean; role: AdminRole } }>(
    '/api/v1/admin/handbook/access',
  );
}

export type DashboardStats = {
  totalMintedSupply: string;
  circulatingSupply: string;
  userBalance: string;
  sellerBalance: string;
  treasuryBalance: string;
  rewardPoolBalance: string;
  treasuryAndRewardPool: string;
  totalCompanyRevenueThb: string;
  pendingTopUpCount: number;
  approvedTopUpCount: number;
  approvedTopUpCoinSum: string;
  ledgerHealthy: boolean;
  generatedAt: string;
  reconcile: {
    ok: boolean;
    delta: string;
    accountedSupply: string;
    circulatingSupply: string;
    treasuryAndPools: string;
    systemMintContra: string;
  };
};

export type TopUpRow = {
  id: string;
  amountThb: string;
  amountCoin: string;
  proofUrl: string;
  proofNote?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  submittedBy: string;
  reviewedBy?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  sellerWallet: {
    id: string;
    ownerRef: string;
    displayName: string;
  };
};

export function fetchStats() {
  return request<{ ok: true; data: DashboardStats }>('/api/v1/admin/dashboard/stats');
}

export function fetchTopUps(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<{ ok: true; data: TopUpRow[] }>(`/api/v1/admin/topup${q}`);
}

export function approveTopUp(topUpId: string, idempotencyKey: string, reviewNote?: string) {
  return request<{ ok: true; replay: boolean; data: unknown }>('/api/v1/admin/topup/approve', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ topUpId, reviewNote }),
  });
}

export function fetchReconcile() {
  return request<{ ok: boolean; data: DashboardStats['reconcile'] }>('/api/v1/ledger/reconcile');
}

export function newIdempotencyKey(prefix = 'approve') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export type ModerationStats = {
  openReports: number;
  actionedReports: number;
  hiddenPosts: number;
  removedPosts: number;
  pendingReview?: number;
  autoHiddenPosts?: number;
  bannedUsers?: number;
  hardDeletedUsers?: number;
  blacklistEntries?: number;
  topCategories?: Array<{ reason: string; count: number }>;
};

export type ModerationReport = {
  id: string;
  kind: 'user' | 'content' | 'message' | 'comment';
  targetId: string;
  targetLabel?: string;
  reason: string;
  details?: string;
  status: 'open' | 'reviewed' | 'actioned' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
};

export type ContentModerationRecord = {
  contentId: string;
  status: 'hidden' | 'removed' | 'pending_review';
  reason: string;
  authorHandle?: string;
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
  status: 'active' | 'soft_banned' | 'banned' | 'hard_deleted';
  banCount: number;
  social: Partial<Record<'apple' | 'google' | 'line', string>>;
  updatedAt: string;
};

export type SocialBlacklistEntry = {
  id: string;
  provider: 'apple' | 'google' | 'line';
  providerUserId: string;
  userId: string;
  reason: string;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
};

export function fetchModerationStats() {
  return request<{ ok: true; data: ModerationStats }>('/api/v1/admin/moderation/stats');
}

export function fetchModerationReports(status = 'open') {
  const q = `?status=${encodeURIComponent(status)}`;
  return request<{ ok: true; data: ModerationReport[] }>(`/api/v1/admin/moderation/reports${q}`);
}

export function resolveModerationReport(
  reportId: string,
  action: 'hide_content' | 'remove_content' | 'dismiss' | 'mark_reviewed' | 'hide' | 'remove',
  note?: string,
) {
  return request<{ ok: true; data: unknown }>(
    `/api/v1/admin/moderation/reports/${encodeURIComponent(reportId)}/action`,
    {
      method: 'POST',
      body: JSON.stringify({ action, note }),
    },
  );
}

export function fetchModeratedContent() {
  return request<{ ok: true; data: ContentModerationRecord[] }>('/api/v1/admin/moderation/content');
}

export function moderateContent(
  contentId: string,
  action: 'hide' | 'remove' | 'restore',
  reason?: string,
) {
  return request<{ ok: true; data: unknown }>(
    `/api/v1/admin/moderation/content/${encodeURIComponent(contentId)}/action`,
    {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    },
  );
}

export function fetchModerationUsers() {
  return request<{ ok: true; data: ModeratedUser[] }>('/api/v1/admin/moderation/users');
}

export function banUser(userId: string, reason: string, mode: 'soft' | 'hard' = 'hard') {
  return request<{ ok: true; data: unknown }>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/ban`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, mode }),
    },
  );
}

export function hardDeleteUser(userId: string, reason?: string) {
  return request<{ ok: true; data: unknown }>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/hard-delete`,
    {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    },
  );
}

export function fetchBlacklist() {
  return request<{ ok: true; data: SocialBlacklistEntry[] }>('/api/v1/admin/moderation/blacklist');
}

export function fetchAuditLog(limit = 50) {
  return request<{ ok: true; data: AuditEntry[] }>(
    `/api/v1/admin/moderation/audit?limit=${limit}`,
  );
}
