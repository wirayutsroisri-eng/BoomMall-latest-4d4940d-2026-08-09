import { getActor, getApiKey } from './api';

async function chatRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export type ChatHealth = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';

export type ChatDashboard = {
  health: ChatHealth;
  activeConversations: number;
  messagesPerMinute: number;
  deliverySuccessRate: number;
  failedMessages: number;
  realtimeConnections: number;
  unreadBacklog: number;
  pushNotificationFailures: number;
  reportedMessages: number;
  blockedUsers: number;
  spamIncidents: number;
  abuseIncidents: number;
  emergency: {
    pauseNewConversations: boolean;
    pauseMediaUpload: boolean;
    pauseExternalLinks: boolean;
    pauseMessaging: boolean;
  };
  alerts: string[];
  generatedAt: string;
};

export type ChatReport = {
  id: string;
  caseId: string;
  reporterRef: string;
  reportedUserId: string;
  conversationId: string;
  messageId: string;
  messagePreview: string;
  reason: string;
  riskScore: number;
  reportCount: number;
  previousViolations: number;
  status: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
};

export type ChatPolicy = {
  id: string;
  version: string;
  status: 'draft' | 'test' | 'active' | 'archived';
  sensitivity: { spam: number; scam: number; harassment: number };
  detections: {
    externalPaymentScam: boolean;
    repeatedMessage: boolean;
    massMessaging: boolean;
    botDetection: boolean;
    linkSpam: boolean;
    phoneSpam: boolean;
  };
  antiSpam: {
    repeatedMessageCount: number;
    massDmPerHour: number;
    newConversationsPerHour: number;
    linkSharePerHour: number;
  };
  riskThresholds: {
    allowMax: number;
    flagMax: number;
    limitMax: number;
    tempRestrictMax: number;
  };
  policyPrompt: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy: string;
};

export type DeliveryEvent = {
  id: string;
  conversationId: string;
  userId: string;
  status: string;
  errorType?: string;
  createdAt: string;
};

export type RealtimeMonitor = {
  websocketConnections: number;
  reconnectRate: number;
  connectionErrors: number;
  latencyMs: number;
  droppedEvents: number;
  duplicateEvents: number;
  updatedAt: string;
  health: ChatHealth;
  alerts: string[];
};

export type PushMonitor = {
  pushSent: number;
  pushDelivered: number;
  pushFailed: number;
  notificationRetry: number;
  updatedAt: string;
};

export type BlockStats = {
  mostBlocked: Array<{ userId: string; blockCount: number }>;
  blockRate: number;
  unblockRate: number;
  repeatedAbuseAccounts: Array<{ userId: string; incidents: number }>;
  note?: string;
  updatedAt: string;
};

export type UserRestrictions = {
  userId: string;
  capabilities: Record<string, boolean>;
  reason: string;
  updatedAt: string;
  updatedBy: string;
};

export type ChatAnalytics = {
  dauChat: number;
  messagesPerUser: number;
  conversationCreation: number;
  replyRate: number;
  medianReplyTimeSec: number;
  blockedRate: number;
  reportRate: number;
  spamRate: number;
  deliveryRate: number;
  failureRate: number;
  generatedAt: string;
};

export type EmergencyState = {
  pauseNewConversations: boolean;
  pauseMediaUpload: boolean;
  pauseExternalLinks: boolean;
  pauseMessaging: boolean;
  updatedAt: string;
  updatedBy?: string;
};

export function fetchChatDashboard() {
  return chatRequest<{ ok: true; data: ChatDashboard }>('/api/v1/admin/chat/dashboard');
}

export function fetchChatReports(status = 'open') {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return chatRequest<{ ok: true; data: ChatReport[] }>(`/api/v1/admin/chat/reports${q}`);
}

export function resolveChatReport(
  reportId: string,
  action: string,
  note?: string,
  confirmPermanentBan?: boolean,
) {
  return chatRequest<{ ok: true; data: unknown }>(
    `/api/v1/admin/chat/reports/${encodeURIComponent(reportId)}/action`,
    {
      method: 'POST',
      body: JSON.stringify({ action, note, confirmPermanentBan }),
    },
  );
}

export function openReportedMessageAccess(input: {
  reportId?: string;
  conversationId: string;
  messageId: string;
  reason: string;
}) {
  return chatRequest<{
    ok: true;
    data: { case: unknown; audit: unknown; body: string };
  }>('/api/v1/admin/chat/access/message', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchChatPolicies() {
  return chatRequest<{
    ok: true;
    data: { active: ChatPolicy; versions: ChatPolicy[] };
  }>('/api/v1/admin/chat/policy');
}

export function saveChatPolicyDraft(payload: Omit<ChatPolicy, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'createdBy' | 'publishedAt'> & { version: string }) {
  return chatRequest<{ ok: true; data: ChatPolicy }>('/api/v1/admin/chat/policy/draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setChatPolicyStatus(policyId: string, status: string) {
  return chatRequest<{ ok: true; data: ChatPolicy }>(
    `/api/v1/admin/chat/policy/${encodeURIComponent(policyId)}/status`,
    { method: 'POST', body: JSON.stringify({ status }) },
  );
}

export function rollbackChatPolicy(policyId: string) {
  return chatRequest<{ ok: true; data: ChatPolicy }>(
    `/api/v1/admin/chat/policy/${encodeURIComponent(policyId)}/rollback`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function fetchChatDelivery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  const qs = q.toString();
  return chatRequest<{ ok: true; data: DeliveryEvent[] }>(
    `/api/v1/admin/chat/delivery${qs ? `?${qs}` : ''}`,
  );
}

export function fetchChatRealtime() {
  return chatRequest<{ ok: true; data: RealtimeMonitor }>('/api/v1/admin/chat/realtime');
}

export function fetchChatNotifications() {
  return chatRequest<{ ok: true; data: PushMonitor }>('/api/v1/admin/chat/notifications');
}

export function fetchChatBlocks() {
  return chatRequest<{ ok: true; data: BlockStats }>('/api/v1/admin/chat/blocks');
}

export function fetchChatRestrictions(userId?: string) {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return chatRequest<{ ok: true; data: UserRestrictions[] }>(
    `/api/v1/admin/chat/restrictions${q}`,
  );
}

export function updateChatRestrictions(payload: {
  userId: string;
  capabilities: Record<string, boolean>;
  reason: string;
}) {
  return chatRequest<{ ok: true; data: UserRestrictions }>('/api/v1/admin/chat/restrictions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchChatAnalytics() {
  return chatRequest<{ ok: true; data: ChatAnalytics }>('/api/v1/admin/chat/analytics');
}

export function fetchChatEmergency() {
  return chatRequest<{ ok: true; data: EmergencyState }>('/api/v1/admin/chat/emergency');
}

export function updateChatEmergency(payload: {
  patch: Partial<EmergencyState>;
  confirm: boolean;
  reason: string;
}) {
  return chatRequest<{ ok: true; data: EmergencyState }>('/api/v1/admin/chat/emergency', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
