const API_KEY_STORAGE = 'boommall.admin.apiKey';
const ACTOR_STORAGE = 'boommall.admin.actor';
const ROLE_STORAGE = 'boommall.admin.role';

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SAFETY'
  | 'ADS'
  | 'FEED'
  | 'MARKETPLACE'
  | 'FINANCE';

export type AdminNavKey =
  | 'dashboard'
  | 'users'
  | 'content'
  | 'feed'
  | 'ads'
  | 'safety'
  | 'sellers'
  | 'finance'
  | 'shopChat'
  | 'analytics'
  | 'ai'
  | 'domains'
  | 'settings'
  | 'handbook';

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
  const allowed: AdminRole[] = [
    'SUPER_ADMIN',
    'ADMIN',
    'SAFETY',
    'ADS',
    'FEED',
    'MARKETPLACE',
    'FINANCE',
  ];
  return allowed.includes(r as AdminRole) ? (r as AdminRole) : null;
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
  desk?: AdminRole;
  deskLabel?: string;
  home?: string;
  permissions: {
    dashboard: boolean;
    topupApprove: boolean;
    handbook: boolean;
    ledgerReconcile: boolean;
    moderation?: boolean;
    chatAdmin?: boolean;
    chatEmergency?: boolean;
    gpWrite?: boolean;
  };
  nav?: Record<AdminNavKey, boolean>;
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
  dau24h?: number;
  gmvPaidThb?: number;
  gpCollectedThb?: number;
  netToMerchantThb?: number;
  paidOrderCount?: number;
  userCount?: number;
  postCount?: number;
  popularPosts?: Array<{ id: string; body: string; likeCount: number; commentCount: number }>;
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
  reporterRef?: string;
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

export function banUser(
  userId: string,
  reason: string,
  mode: 'soft' | 'hard' = 'hard',
  reportId: string,
) {
  return request<{ ok: true; data: unknown }>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/ban`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, mode, reportId }),
    },
  );
}

export function unlockUser(userId: string, reason: string, reportId?: string) {
  return request<{ ok: true; data: unknown }>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/unlock`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, reportId }),
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

export type AdminUserRow = {
  userId: string;
  displayName?: string | null;
  handle?: string | null;
  role: string;
  shopId?: string | null;
  updatedAt: string;
};

export function fetchAdminUsers() {
  return request<{ ok: true; data: AdminUserRow[] }>('/api/v1/auth/users');
}

export function adminSetUserRole(userId: string, role: string) {
  return request<{ ok: true; data: AdminUserRow }>(`/api/v1/auth/users/${encodeURIComponent(userId)}/role`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export function adminResetPassword(userId: string) {
  return request<{ ok: true; data: { userId: string; temporaryPassword: string; note: string } }>(
    `/api/v1/auth/users/${encodeURIComponent(userId)}/reset-password`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export type BoardThreadRow = {
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
};

export function fetchAdminBoardThreads() {
  return request<{ ok: true; data: BoardThreadRow[] }>('/api/v1/admin/board/threads');
}

export function pinAdminBoardThread(id: string, pinned: boolean) {
  return request<{ ok: true; data: BoardThreadRow }>(
    `/api/v1/admin/board/threads/${encodeURIComponent(id)}/pin`,
    { method: 'POST', body: JSON.stringify({ pinned }) },
  );
}

export function hideAdminBoardThread(id: string) {
  return request<{ ok: true; data: BoardThreadRow }>(
    `/api/v1/admin/board/threads/${encodeURIComponent(id)}/hide`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export type AdminPostRow = {
  id: string;
  authorId: string;
  body: string;
  status: string;
  likeCount: number;
  reportCount: number;
  createdAt: string;
};

export function fetchAdminPosts() {
  return request<{ ok: true; data: AdminPostRow[] }>('/api/v1/admin/feed-domain/posts');
}

export type AnalyticsSummary = {
  hours: number;
  total: number;
  byName: Array<{ name: string; count: number }>;
  recent: Array<{
    id: string;
    userId: string | null;
    name: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: string;
  }>;
};

export function fetchCommerceAnalytics(hours = 24) {
  return request<{ ok: true; data: AnalyticsSummary }>(
    `/api/v1/admin/commerce/analytics?hours=${hours}`,
  );
}

export type CommerceSellerRow = {
  merchantId: string;
  shopName: string;
  productCount: number;
};

export function fetchCommerceSellers() {
  return request<{ ok: true; data: CommerceSellerRow[] }>('/api/v1/admin/commerce/sellers');
}

export type CommerceOrderRow = {
  id: string;
  buyerId: string;
  merchantId?: string | null;
  status: string;
  merchandiseThb: number;
  gpBps?: number | null;
  gpAmountThb?: number;
  netToMerchantThb?: number | null;
  createdAt: string;
  pspRef: string | null;
  shippingStatus?: string | null;
  settlementStatus?: string;
  returnStatus?: string;
  completedAt?: string | null;
  releaseEligibleAt?: string | null;
};

export function fetchCommerceOrders() {
  return request<{ ok: true; data: CommerceOrderRow[] }>('/api/v1/admin/commerce/orders');
}

export type MerchantGpOverride = {
  merchantId: string;
  shopName?: string;
  gpBps: number;
};

export type GpPolicy = {
  id: string;
  enabled: boolean;
  defaultGpBps: number;
  b2cGpBps: number | null;
  b2bGpBps: number | null;
  minOrderThb: number;
  holdDaysAfterComplete: number;
  payoutCycleDays: number;
  merchantOverrides: MerchantGpOverride[];
  updatedAt: string;
  updatedBy: string | null;
};

export type PlatformBooks = {
  currency: string;
  cashThb: number;
  gpRevenueThb: number;
  merchantHeldThb: number;
  merchantPayableThb: number;
  merchantQueuedThb: number;
  buyerRefundLiabilityThb: number;
  settlement: Array<{
    status: string;
    count: number;
    gmvThb: number;
    gpThb: number;
    netThb: number;
  }>;
  batches: Array<{
    id: string;
    status: string;
    scheduledFor: string;
    totalThb: number;
    orderCount: number;
    merchantCount: number;
    runBy: string | null;
    note: string | null;
    createdAt: string;
  }>;
};

export function fetchPlatformBooks() {
  return request<{ ok: true; data: PlatformBooks }>('/api/v1/admin/commerce/books');
}

export function createWeeklyPayout() {
  return request<{
    ok: true;
    data: {
      id: string;
      status: string;
      scheduledFor: string;
      totalThb: number;
      orderCount: number;
      merchantCount: number;
    };
  }>('/api/v1/admin/commerce/payouts/weekly', { method: 'POST', body: '{}' });
}

export function fetchGpPolicy() {
  return request<{ ok: true; data: GpPolicy }>('/api/v1/admin/ecommerce/gp/policy');
}

export function saveGpPolicy(input: Partial<GpPolicy>) {
  return request<{ ok: true; data: GpPolicy }>('/api/v1/admin/ecommerce/gp/policy', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export type GpAuditRow = {
  id: string;
  actor: string;
  action: string;
  entityId: string;
  amountThb?: string | null;
  gpBps?: number | null;
  gpAmountThb?: string | null;
  createdAt: string;
};

export type PlatformBankAccount = {
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  bankCode: string | null;
};

export type PlatformFinanceSettings = {
  defaultGpPercent: number;
  autoCompleteDays: number;
  payoutMode: 'MANUAL' | 'AUTO';
  /** เพดานโอนออโต้ต่อครั้ง (บาท) */
  autoPayoutMaxLimit: number;
  bankAccount: PlatformBankAccount;
};

export type AccountingPack = {
  title: string;
  generatedAt: string;
  currency: string;
  receivingAccount: PlatformBankAccount;
  escrowRules: { defaultGpPercent: number; autoCompleteDays: number };
  lines: Array<{ code: string; label: string; amount: number }>;
  counts: { ordersInEscrow: number; pendingWithdrawals: number };
  note: string;
};

export function fetchAccountingPack() {
  return request<{ ok: true; data: AccountingPack }>('/api/v1/admin/commerce/finance/accounting-pack');
}

export function fetchFinanceSettings() {
  return request<{ ok: true; data: PlatformFinanceSettings }>('/api/v1/admin/commerce/finance/settings');
}

export function saveFinanceSettings(input: Partial<PlatformFinanceSettings> & {
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  bankCode?: string | null;
  payoutMode?: 'MANUAL' | 'AUTO';
  autoPayoutMaxLimit?: number;
}) {
  return request<{ ok: true; data: PlatformFinanceSettings }>('/api/v1/admin/commerce/finance/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export type PlatformRevenue = {
  commissionEarned: number;
  commissionReleased: number;
  gmvHeldOrReleased: number;
  netToMerchants: number;
  defaultGpPercent: number;
  ordersInEscrow: number;
};

export function fetchPlatformRevenue() {
  return request<{ ok: true; data: PlatformRevenue }>('/api/v1/admin/commerce/finance/revenue');
}

export type EscrowLedgerRow = {
  id: string;
  orderId: string;
  storeId: string;
  storeName: string;
  grossAmount: number;
  gpPercent: number;
  gpAmount: number;
  netMerchantAmount: number;
  releaseStatus: string;
  releaseDueDate: string | null;
  payoutProof: string | null;
  paidOutAt: string | null;
  tab: 'hold' | 'ready' | 'completed' | 'other';
  createdAt: string;
};

export function fetchEscrowLedger() {
  return request<{ ok: true; data: EscrowLedgerRow[] }>('/api/v1/admin/commerce/finance/escrows');
}

export function markEscrowPayout(id: string, proofOfTransfer: string) {
  return request<{ ok: true; data: { id: string; paidOutAt: string | null; payoutProof: string | null } }>(
    `/api/v1/admin/commerce/finance/escrows/${encodeURIComponent(id)}/payout`,
    { method: 'POST', body: JSON.stringify({ proofOfTransfer }) },
  );
}

export type SellerWithdrawalRow = {
  id: string;
  sellerId: string;
  storeName?: string;
  amount: number;
  status: string;
  payoutChannel: 'MANUAL' | 'AUTO';
  payoutProvider?: string | null;
  payoutRef?: string | null;
  manualReason?: string | null;
  proofOfTransfer?: string | null;
  badge: 'manual_pending' | 'auto_done';
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  transferredAt?: string | null;
  createdAt: string;
};

export function fetchSellerWithdrawals() {
  return request<{ ok: true; data: SellerWithdrawalRow[] }>('/api/v1/admin/commerce/finance/withdrawals');
}

export function approveSellerWithdrawal(id: string, proofOfTransfer: string) {
  return request<{ ok: true; data: { id: string; status: string; amount: number } }>(
    `/api/v1/admin/commerce/finance/withdrawals/${encodeURIComponent(id)}/approve`,
    { method: 'POST', body: JSON.stringify({ proofOfTransfer }) },
  );
}

export function rejectSellerWithdrawal(id: string) {
  return request<{ ok: true; data: { id: string; status: string } }>(
    `/api/v1/admin/commerce/finance/withdrawals/${encodeURIComponent(id)}/reject`,
    { method: 'POST', body: '{}' },
  );
}

export function fetchGpAudit(limit = 20) {
  return request<{ ok: true; data: GpAuditRow[] }>(`/api/v1/admin/ecommerce/audit?limit=${limit}`);
}

export type TaxReportKind = 'sales-tax' | 'revenue-ledger' | 'payouts' | 'merchants';

export type TaxReportSummary = {
  period: { from: string; to: string; label: string };
  currency: string;
  note: string;
  summary: {
    grossVolume: number;
    gpInclusive: number;
    gpTaxBase: number;
    outputVat: number;
    refundGross: number;
    refundGp: number;
    refundVat: number;
  };
  counts: {
    salesTaxRows: number;
    creditNoteRows: number;
    ledgerRows: number;
    payoutRows: number;
    merchantRows: number;
  };
};

export type TaxReportQuery = { month?: string; from?: string; to?: string };

function taxReportQuery(q: TaxReportQuery & { format?: string }) {
  const p = new URLSearchParams();
  if (q.month) p.set('month', q.month);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.format) p.set('format', q.format);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function fetchTaxReportSummary(q: TaxReportQuery) {
  return request<{ ok: true; data: TaxReportSummary }>(
    `/api/v1/admin/commerce/finance/tax-reports/summary${taxReportQuery(q)}`,
  );
}

export async function downloadTaxReport(kind: TaxReportKind, format: 'xlsx' | 'pdf' | 'csv', q: TaxReportQuery) {
  const headers = new Headers();
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);
  headers.set('X-Admin-Actor', getActor());
  const res = await fetch(
    `/api/v1/admin/commerce/finance/tax-reports/${kind}${taxReportQuery({ ...q, format })}`,
    { headers },
  );
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '');
  const filename = match?.[1] ?? `boommall-${kind}.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
