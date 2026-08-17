/**
 * BoomMall Chat Admin service — separated domain inside the platform API.
 * Persistence: data/chat-admin.json (no direct DB edits from Admin UI).
 * Private message bodies are sealed; case-based access + audit required.
 */

import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../../lib/errors';

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';

export type ChatCapability =
  | 'CAN_SEND_MESSAGE'
  | 'CAN_SEND_MEDIA'
  | 'CAN_SEND_LINK'
  | 'CAN_CREATE_NEW_CONVERSATION'
  | 'CAN_MESSAGE_SELLERS'
  | 'CAN_MESSAGE_BUYERS';

export type RiskBandAction =
  | 'ALLOW'
  | 'FLAG'
  | 'LIMIT'
  | 'TEMP_RESTRICT'
  | 'HOLD_HUMAN_REVIEW';

export type ReportAction =
  | 'allow'
  | 'remove_message'
  | 'restrict_messaging'
  | 'mute_user'
  | 'temp_suspend_chat'
  | 'escalate'
  | 'ban_recommendation'
  | 'permanent_ban';

export type ModerationActionType =
  | 'ALLOW'
  | 'HIDE_FOR_RECIPIENT'
  | 'REMOVE'
  | 'LIMIT_MESSAGING'
  | 'TEMP_MUTE'
  | 'ESCALATE';

export type PolicyStatus = 'draft' | 'test' | 'active' | 'archived';

export type DeliveryStatus = 'sent' | 'delivered' | 'seen' | 'failed' | 'retrying';

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
  status: 'open' | 'in_review' | 'resolved' | 'escalated';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
};

export type SealedMessage = {
  messageId: string;
  conversationId: string;
  body: string;
  createdAt: string;
};

export type AccessCase = {
  id: string;
  conversationId: string;
  messageId: string;
  reportId?: string;
  reason: string;
  requestedBy: string;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt?: string;
};

export type AccessAudit = {
  id: string;
  adminId: string;
  caseId: string;
  conversationId: string;
  messageId: string;
  reason: string;
  timestamp: string;
};

export type Sensitivity = {
  spam: number;
  scam: number;
  harassment: number;
};

export type DetectionToggles = {
  externalPaymentScam: boolean;
  repeatedMessage: boolean;
  massMessaging: boolean;
  botDetection: boolean;
  linkSpam: boolean;
  phoneSpam: boolean;
};

export type AntiSpamThresholds = {
  repeatedMessageCount: number;
  massDmPerHour: number;
  newConversationsPerHour: number;
  linkSharePerHour: number;
};

export type RiskThresholds = {
  allowMax: number; // 0-39
  flagMax: number; // 40-59
  limitMax: number; // 60-79
  tempRestrictMax: number; // 80-94
  // 95+ HOLD_HUMAN_REVIEW
};

export type ChatPolicy = {
  id: string;
  version: string;
  status: PolicyStatus;
  sensitivity: Sensitivity;
  detections: DetectionToggles;
  antiSpam: AntiSpamThresholds;
  riskThresholds: RiskThresholds;
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
  status: DeliveryStatus;
  errorType?: string;
  createdAt: string;
  // intentionally NO message body
};

export type RealtimeSnapshot = {
  websocketConnections: number;
  reconnectRate: number;
  connectionErrors: number;
  latencyMs: number;
  droppedEvents: number;
  duplicateEvents: number;
  updatedAt: string;
};

export type PushSnapshot = {
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
  updatedAt: string;
};

export type UserRestrictions = {
  userId: string;
  capabilities: Record<ChatCapability, boolean>;
  reason: string;
  updatedAt: string;
  updatedBy: string;
};

export type ModerationLog = {
  id: string;
  targetType: 'message' | 'user' | 'conversation';
  targetId: string;
  action: ModerationActionType;
  reason: string;
  policyVersion: string;
  riskScore: number;
  adminAction: string;
  adminId: string;
  timestamp: string;
};

export type EmergencyState = {
  pauseNewConversations: boolean;
  pauseMediaUpload: boolean;
  pauseExternalLinks: boolean;
  pauseMessaging: boolean;
  updatedAt: string;
  updatedBy?: string;
};

export type RuntimeCounters = {
  activeConversations: number;
  messagesPerMinute: number;
  sent: number;
  delivered: number;
  failedMessages: number;
  realtimeConnections: number;
  unreadBacklog: number;
  pushNotificationFailures: number;
  spamIncidents: number;
  abuseIncidents: number;
  dauChat: number;
  messagesPerUser: number;
  conversationCreation: number;
  replyRate: number;
  medianReplyTimeSec: number;
  updatedAt: string;
};

export type ChatAudit = {
  id: string;
  actor: string;
  role: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

type StoreShape = {
  sealedMessages: Record<string, SealedMessage>;
  reports: ChatReport[];
  accessCases: AccessCase[];
  accessAudit: AccessAudit[];
  policies: ChatPolicy[];
  activePolicyId: string;
  deliveryEvents: DeliveryEvent[];
  realtime: RealtimeSnapshot;
  push: PushSnapshot;
  blocks: BlockStats;
  restrictions: Record<string, UserRestrictions>;
  moderationLog: ModerationLog[];
  emergency: EmergencyState;
  runtime: RuntimeCounters;
  audit: ChatAudit[];
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'chat-admin.json');

const CAPABILITIES: ChatCapability[] = [
  'CAN_SEND_MESSAGE',
  'CAN_SEND_MEDIA',
  'CAN_SEND_LINK',
  'CAN_CREATE_NEW_CONVERSATION',
  'CAN_MESSAGE_SELLERS',
  'CAN_MESSAGE_BUYERS',
];

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function defaultSensitivity(): Sensitivity {
  return { spam: 50, scam: 60, harassment: 55 };
}

function defaultDetections(): DetectionToggles {
  return {
    externalPaymentScam: true,
    repeatedMessage: true,
    massMessaging: true,
    botDetection: true,
    linkSpam: true,
    phoneSpam: true,
  };
}

function defaultAntiSpam(): AntiSpamThresholds {
  return {
    repeatedMessageCount: 5,
    massDmPerHour: 30,
    newConversationsPerHour: 20,
    linkSharePerHour: 10,
  };
}

function defaultRiskThresholds(): RiskThresholds {
  return {
    allowMax: 39,
    flagMax: 59,
    limitMax: 79,
    tempRestrictMax: 94,
  };
}

function defaultPolicy(actor: string): ChatPolicy {
  const ts = now();
  return {
    id: 'pol_chat_v1_0',
    version: 'v1.0',
    status: 'active',
    sensitivity: defaultSensitivity(),
    detections: defaultDetections(),
    antiSpam: defaultAntiSpam(),
    riskThresholds: defaultRiskThresholds(),
    policyPrompt:
      'Protect users from spam, scam, and harassment. Prefer reversible limits. Never ban from AI score alone — human review required at 95+.',
    createdAt: ts,
    updatedAt: ts,
    publishedAt: ts,
    createdBy: actor,
  };
}

function emptyRuntime(): RuntimeCounters {
  const ts = now();
  return {
    activeConversations: 0,
    messagesPerMinute: 0,
    sent: 0,
    delivered: 0,
    failedMessages: 0,
    realtimeConnections: 0,
    unreadBacklog: 0,
    pushNotificationFailures: 0,
    spamIncidents: 0,
    abuseIncidents: 0,
    dauChat: 0,
    messagesPerUser: 0,
    conversationCreation: 0,
    replyRate: 0,
    medianReplyTimeSec: 0,
    updatedAt: ts,
  };
}

function emptyStore(): StoreShape {
  const policy = defaultPolicy('system');
  const ts = now();
  return {
    sealedMessages: {},
    reports: [],
    accessCases: [],
    accessAudit: [],
    policies: [policy],
    activePolicyId: policy.id,
    deliveryEvents: [],
    realtime: {
      websocketConnections: 0,
      reconnectRate: 0,
      connectionErrors: 0,
      latencyMs: 0,
      droppedEvents: 0,
      duplicateEvents: 0,
      updatedAt: ts,
    },
    push: {
      pushSent: 0,
      pushDelivered: 0,
      pushFailed: 0,
      notificationRetry: 0,
      updatedAt: ts,
    },
    blocks: {
      mostBlocked: [],
      blockRate: 0,
      unblockRate: 0,
      repeatedAbuseAccounts: [],
      updatedAt: ts,
    },
    restrictions: {},
    moderationLog: [],
    emergency: {
      pauseNewConversations: false,
      pauseMediaUpload: false,
      pauseExternalLinks: false,
      pauseMessaging: false,
      updatedAt: ts,
    },
    runtime: emptyRuntime(),
    audit: [],
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
    if (!parsed.policies?.length) {
      const s = emptyStore();
      writeStore(s);
      return s;
    }
    return {
      ...emptyStore(),
      ...parsed,
      sealedMessages: parsed.sealedMessages ?? {},
      reports: parsed.reports ?? [],
      accessCases: parsed.accessCases ?? [],
      accessAudit: parsed.accessAudit ?? [],
      policies: parsed.policies,
      deliveryEvents: parsed.deliveryEvents ?? [],
      restrictions: parsed.restrictions ?? {},
      moderationLog: parsed.moderationLog ?? [],
      audit: parsed.audit ?? [],
      runtime: { ...emptyRuntime(), ...(parsed.runtime ?? {}) },
    };
  } catch {
    const s = emptyStore();
    writeStore(s);
    return s;
  }
}

function pushAudit(
  store: StoreShape,
  input: Omit<ChatAudit, 'id' | 'createdAt'>,
) {
  store.audit = [
    {
      id: newId('aud'),
      createdAt: now(),
      ...input,
    },
    ...store.audit,
  ].slice(0, 2000);
}

export function riskBandForScore(score: number, t: RiskThresholds): RiskBandAction {
  if (score <= t.allowMax) return 'ALLOW';
  if (score <= t.flagMax) return 'FLAG';
  if (score <= t.limitMax) return 'LIMIT';
  if (score <= t.tempRestrictMax) return 'TEMP_RESTRICT';
  return 'HOLD_HUMAN_REVIEW';
}

export function computeHealth(store: StoreShape): HealthStatus {
  const { runtime, emergency, realtime, push } = store;
  if (
    emergency.pauseMessaging ||
    runtime.unreadBacklog > 5000 ||
    runtime.failedMessages > 1000 ||
    realtime.connectionErrors > 200
  ) {
    return 'CRITICAL';
  }
  const deliveryDenom = runtime.sent || 0;
  const failRate = deliveryDenom > 0 ? runtime.failedMessages / deliveryDenom : 0;
  if (
    emergency.pauseNewConversations ||
    emergency.pauseMediaUpload ||
    failRate > 0.05 ||
    runtime.unreadBacklog > 500 ||
    push.pushFailed > 100 ||
    realtime.reconnectRate > 0.25
  ) {
    return 'DEGRADED';
  }
  return 'HEALTHY';
}

export function getChatDashboard() {
  const store = readStore();
  const sent = store.runtime.sent || 0;
  const delivered = store.runtime.delivered || 0;
  const deliverySuccessRate = sent > 0 ? Number(((delivered / sent) * 100).toFixed(2)) : 100;
  const openReports = store.reports.filter((r) => r.status === 'open' || r.status === 'in_review');
  const blockedUsers = store.blocks.mostBlocked.length;
  const alerts: string[] = [];
  if (store.runtime.failedMessages > 50) alerts.push('Delivery failure elevated');
  if (store.realtime.connectionErrors > 20) alerts.push('Realtime errors elevated');
  if (store.runtime.unreadBacklog > 200) alerts.push('Queue backlog elevated');

  return {
    health: computeHealth(store),
    activeConversations: store.runtime.activeConversations,
    messagesPerMinute: store.runtime.messagesPerMinute,
    deliverySuccessRate,
    failedMessages: store.runtime.failedMessages,
    realtimeConnections: store.realtime.websocketConnections || store.runtime.realtimeConnections,
    unreadBacklog: store.runtime.unreadBacklog,
    pushNotificationFailures: store.runtime.pushNotificationFailures || store.push.pushFailed,
    reportedMessages: openReports.length,
    blockedUsers,
    spamIncidents: store.runtime.spamIncidents,
    abuseIncidents: store.runtime.abuseIncidents,
    emergency: store.emergency,
    alerts,
    generatedAt: now(),
  };
}

export function listChatReports(status?: string) {
  const store = readStore();
  if (!status || status === 'all') return store.reports;
  return store.reports.filter((r) => r.status === status);
}

export function ingestChatReport(input: {
  reporterRef: string;
  reportedUserId: string;
  conversationId: string;
  messageId: string;
  messageBody: string;
  reason: string;
  riskScore?: number;
  previousViolations?: number;
}) {
  const store = readStore();
  const preview =
    input.messageBody.length > 80
      ? `${input.messageBody.slice(0, 77)}…`
      : input.messageBody;
  const existing = store.reports.find(
    (r) => r.messageId === input.messageId && (r.status === 'open' || r.status === 'in_review'),
  );
  if (existing) {
    existing.reportCount += 1;
    existing.riskScore = Math.max(existing.riskScore, input.riskScore ?? existing.riskScore);
    writeStore(store);
    return existing;
  }

  store.sealedMessages[input.messageId] = {
    messageId: input.messageId,
    conversationId: input.conversationId,
    body: input.messageBody,
    createdAt: now(),
  };

  const report: ChatReport = {
    id: newId('crep'),
    caseId: newId('case'),
    reporterRef: input.reporterRef,
    reportedUserId: input.reportedUserId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    messagePreview: preview,
    reason: input.reason,
    riskScore: Math.min(100, Math.max(0, input.riskScore ?? 50)),
    reportCount: 1,
    previousViolations: input.previousViolations ?? 0,
    status: 'open',
    createdAt: now(),
  };
  store.reports = [report, ...store.reports].slice(0, 2000);
  writeStore(store);
  return report;
}

export function openMessageAccessCase(input: {
  adminId: string;
  role: string;
  reportId?: string;
  conversationId: string;
  messageId: string;
  reason: string;
}) {
  if (!input.reason.trim()) {
    throw new AppError('VALIDATION', 'Reason for access is required', 400);
  }
  const store = readStore();
  const sealed = store.sealedMessages[input.messageId];
  if (!sealed) {
    throw new AppError('NOT_FOUND', 'Message not in sealed store (reported messages only)', 404);
  }
  if (sealed.conversationId !== input.conversationId) {
    throw new AppError('VALIDATION', 'conversation_id mismatch', 400);
  }

  const accessCase: AccessCase = {
    id: newId('case'),
    conversationId: input.conversationId,
    messageId: input.messageId,
    reportId: input.reportId,
    reason: input.reason.trim(),
    requestedBy: input.adminId,
    status: 'open',
    createdAt: now(),
  };
  store.accessCases = [accessCase, ...store.accessCases].slice(0, 1000);

  const audit: AccessAudit = {
    id: newId('cacc'),
    adminId: input.adminId,
    caseId: accessCase.id,
    conversationId: input.conversationId,
    messageId: input.messageId,
    reason: input.reason.trim(),
    timestamp: now(),
  };
  store.accessAudit = [audit, ...store.accessAudit].slice(0, 5000);

  pushAudit(store, {
    actor: input.adminId,
    role: input.role,
    action: 'chat.message_access',
    entityType: 'message',
    entityId: input.messageId,
    detail: { caseId: accessCase.id, reason: input.reason.trim(), reportId: input.reportId },
  });

  writeStore(store);
  return { case: accessCase, audit, body: sealed.body };
}

export function resolveChatReport(input: {
  reportId: string;
  action: ReportAction;
  adminId: string;
  role: string;
  note?: string;
  confirmPermanentBan?: boolean;
}) {
  const store = readStore();
  const report = store.reports.find((r) => r.id === input.reportId);
  if (!report) throw new AppError('NOT_FOUND', 'Report not found', 404);

  const active = store.policies.find((p) => p.id === store.activePolicyId) ?? store.policies[0];
  const band = riskBandForScore(report.riskScore, active.riskThresholds);

  if (input.action === 'permanent_ban') {
    if (!input.confirmPermanentBan) {
      throw new AppError(
        'POLICY',
        'Permanent Ban requires confirmPermanentBan=true and Trust & Safety policy review',
        400,
      );
    }
    if (band === 'ALLOW' || band === 'FLAG') {
      throw new AppError(
        'POLICY',
        'Permanent Ban blocked by Trust & Safety — risk band too low; escalate for human review',
        403,
      );
    }
    // Never allow AI-only ban: require prior escalate or human note
    if (!input.note?.trim()) {
      throw new AppError('POLICY', 'Permanent Ban requires human review note', 400);
    }
  }

  const actionMap: Record<ReportAction, ModerationActionType> = {
    allow: 'ALLOW',
    remove_message: 'REMOVE',
    restrict_messaging: 'LIMIT_MESSAGING',
    mute_user: 'TEMP_MUTE',
    temp_suspend_chat: 'TEMP_MUTE',
    escalate: 'ESCALATE',
    ban_recommendation: 'ESCALATE',
    permanent_ban: 'ESCALATE',
  };

  const modAction = actionMap[input.action];
  const logEntry: ModerationLog = {
    id: newId('mlog'),
    targetType: 'message',
    targetId: report.messageId,
    action: modAction,
    reason: input.note || report.reason,
    policyVersion: active.version,
    riskScore: report.riskScore,
    adminAction: input.action,
    adminId: input.adminId,
    timestamp: now(),
  };
  store.moderationLog = [logEntry, ...store.moderationLog].slice(0, 5000);

  if (input.action === 'restrict_messaging' || input.action === 'mute_user') {
    const caps = Object.fromEntries(CAPABILITIES.map((c) => [c, true])) as Record<
      ChatCapability,
      boolean
    >;
    caps.CAN_SEND_MESSAGE = false;
    if (input.action === 'mute_user') {
      caps.CAN_SEND_MEDIA = false;
      caps.CAN_SEND_LINK = false;
      caps.CAN_CREATE_NEW_CONVERSATION = false;
    }
    store.restrictions[report.reportedUserId] = {
      userId: report.reportedUserId,
      capabilities: caps,
      reason: input.note || input.action,
      updatedAt: now(),
      updatedBy: input.adminId,
    };
  }

  if (input.action === 'remove_message') {
    delete store.sealedMessages[report.messageId];
  }

  report.status =
    input.action === 'escalate' || input.action === 'ban_recommendation'
      ? 'escalated'
      : 'resolved';
  report.resolvedAt = now();
  report.resolvedBy = input.adminId;
  report.resolution = input.action;

  pushAudit(store, {
    actor: input.adminId,
    role: input.role,
    action: `chat.report.${input.action}`,
    entityType: 'report',
    entityId: report.id,
    detail: {
      riskScore: report.riskScore,
      riskBand: band,
      policyVersion: active.version,
      note: input.note,
    },
  });

  writeStore(store);
  return { report, riskBand: band, policyVersion: active.version };
}

export function listPolicies() {
  return readStore().policies;
}

export function getActivePolicy() {
  const store = readStore();
  return store.policies.find((p) => p.id === store.activePolicyId) ?? store.policies[0];
}

export function savePolicyDraft(input: {
  actor: string;
  role: string;
  basePolicyId?: string;
  version: string;
  sensitivity: Sensitivity;
  detections: DetectionToggles;
  antiSpam: AntiSpamThresholds;
  riskThresholds: RiskThresholds;
  policyPrompt: string;
}) {
  const store = readStore();
  const existing = store.policies.find((p) => p.version === input.version && p.status === 'draft');
  const ts = now();
  if (existing) {
    existing.sensitivity = input.sensitivity;
    existing.detections = input.detections;
    existing.antiSpam = input.antiSpam;
    existing.riskThresholds = input.riskThresholds;
    existing.policyPrompt = input.policyPrompt;
    existing.updatedAt = ts;
    pushAudit(store, {
      actor: input.actor,
      role: input.role,
      action: 'chat.policy.draft_update',
      entityType: 'policy',
      entityId: existing.id,
      detail: { version: existing.version },
    });
    writeStore(store);
    return existing;
  }

  const draft: ChatPolicy = {
    id: newId('pol'),
    version: input.version,
    status: 'draft',
    sensitivity: input.sensitivity,
    detections: input.detections,
    antiSpam: input.antiSpam,
    riskThresholds: input.riskThresholds,
    policyPrompt: input.policyPrompt,
    createdAt: ts,
    updatedAt: ts,
    createdBy: input.actor,
  };
  store.policies = [draft, ...store.policies];
  pushAudit(store, {
    actor: input.actor,
    role: input.role,
    action: 'chat.policy.draft_create',
    entityType: 'policy',
    entityId: draft.id,
    detail: { version: draft.version, basePolicyId: input.basePolicyId },
  });
  writeStore(store);
  return draft;
}

export function setPolicyStatus(input: {
  policyId: string;
  status: PolicyStatus;
  actor: string;
  role: string;
}) {
  const store = readStore();
  const policy = store.policies.find((p) => p.id === input.policyId);
  if (!policy) throw new AppError('NOT_FOUND', 'Policy not found', 404);

  if (input.status === 'active') {
    for (const p of store.policies) {
      if (p.status === 'active') p.status = 'archived';
    }
    policy.status = 'active';
    policy.publishedAt = now();
    store.activePolicyId = policy.id;
  } else {
    policy.status = input.status;
  }
  policy.updatedAt = now();

  pushAudit(store, {
    actor: input.actor,
    role: input.role,
    action: `chat.policy.${input.status}`,
    entityType: 'policy',
    entityId: policy.id,
    detail: { version: policy.version },
  });
  writeStore(store);
  return policy;
}

export function rollbackPolicy(input: { policyId: string; actor: string; role: string }) {
  return setPolicyStatus({ ...input, status: 'active' });
}

export function listDelivery(filters: {
  status?: string;
  userId?: string;
  conversationId?: string;
  errorType?: string;
  since?: string;
}) {
  const store = readStore();
  return store.deliveryEvents.filter((e) => {
    if (filters.status && e.status !== filters.status) return false;
    if (filters.userId && e.userId !== filters.userId) return false;
    if (filters.conversationId && e.conversationId !== filters.conversationId) return false;
    if (filters.errorType && e.errorType !== filters.errorType) return false;
    if (filters.since && e.createdAt < filters.since) return false;
    return true;
  });
}

export function getRealtimeMonitor() {
  const store = readStore();
  return {
    ...store.realtime,
    health: computeHealth(store),
    alerts: getChatDashboard().alerts,
  };
}

export function getPushMonitor() {
  return readStore().push;
}

export function getBlockStats() {
  const store = readStore();
  return {
    ...store.blocks,
    note: 'Block counts alone must never trigger Permanent Ban — require Trust & Safety review',
  };
}

export function getRestrictions(userId?: string) {
  const store = readStore();
  if (userId) {
    return store.restrictions[userId]
      ? [store.restrictions[userId]]
      : [
          {
            userId,
            capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c, true])) as Record<
              ChatCapability,
              boolean
            >,
            reason: 'default — unrestricted',
            updatedAt: now(),
            updatedBy: 'system',
          },
        ];
  }
  return Object.values(store.restrictions);
}

export function setRestrictions(input: {
  userId: string;
  capabilities: Partial<Record<ChatCapability, boolean>>;
  reason: string;
  actor: string;
  role: string;
}) {
  if (!input.reason.trim()) throw new AppError('VALIDATION', 'reason required', 400);
  const store = readStore();
  const current =
    store.restrictions[input.userId]?.capabilities ??
    (Object.fromEntries(CAPABILITIES.map((c) => [c, true])) as Record<ChatCapability, boolean>);
  const next = { ...current, ...input.capabilities };
  store.restrictions[input.userId] = {
    userId: input.userId,
    capabilities: next,
    reason: input.reason.trim(),
    updatedAt: now(),
    updatedBy: input.actor,
  };
  pushAudit(store, {
    actor: input.actor,
    role: input.role,
    action: 'chat.restrictions.update',
    entityType: 'user',
    entityId: input.userId,
    detail: { capabilities: next, reason: input.reason },
  });
  writeStore(store);
  return store.restrictions[input.userId];
}

export function getChatAnalytics() {
  const store = readStore();
  const sent = store.runtime.sent || 0;
  const delivered = store.runtime.delivered || 0;
  const openReports = store.reports.filter((r) => r.status === 'open').length;
  return {
    dauChat: store.runtime.dauChat,
    messagesPerUser: store.runtime.messagesPerUser,
    conversationCreation: store.runtime.conversationCreation,
    replyRate: store.runtime.replyRate,
    medianReplyTimeSec: store.runtime.medianReplyTimeSec,
    blockedRate: store.blocks.blockRate,
    reportRate: openReports,
    spamRate: store.runtime.spamIncidents,
    deliveryRate: sent > 0 ? Number(((delivered / sent) * 100).toFixed(2)) : 100,
    failureRate: sent > 0 ? Number(((store.runtime.failedMessages / sent) * 100).toFixed(2)) : 0,
    generatedAt: now(),
  };
}

export function getEmergency() {
  return readStore().emergency;
}

export function setEmergency(input: {
  actor: string;
  role: string;
  patch: Partial<
    Pick<
      EmergencyState,
      'pauseNewConversations' | 'pauseMediaUpload' | 'pauseExternalLinks' | 'pauseMessaging'
    >
  >;
  confirm: boolean;
  reason: string;
}) {
  if (input.role !== 'SUPER_ADMIN') {
    throw new AppError('FORBIDDEN', 'SUPER_ADMIN only', 403);
  }
  if (!input.confirm) {
    throw new AppError('VALIDATION', 'Confirmation required for emergency controls', 400);
  }
  if (!input.reason.trim()) {
    throw new AppError('VALIDATION', 'Reason required', 400);
  }
  const store = readStore();
  store.emergency = {
    ...store.emergency,
    ...input.patch,
    updatedAt: now(),
    updatedBy: input.actor,
  };
  pushAudit(store, {
    actor: input.actor,
    role: input.role,
    action: 'chat.emergency.update',
    entityType: 'emergency',
    entityId: 'global',
    detail: { patch: input.patch, reason: input.reason.trim() },
  });
  writeStore(store);
  return store.emergency;
}

export function listChatAudit(limit = 50) {
  return readStore().audit.slice(0, limit);
}

export function listAccessAudit(limit = 50) {
  return readStore().accessAudit.slice(0, limit);
}

/** Service ingest from Chat workers — counters / delivery / realtime (no private bodies unless reporting) */
export function ingestRuntime(partial: Partial<RuntimeCounters>) {
  const store = readStore();
  store.runtime = { ...store.runtime, ...partial, updatedAt: now() };
  writeStore(store);
  return store.runtime;
}

export function ingestRealtime(partial: Partial<RealtimeSnapshot>) {
  const store = readStore();
  store.realtime = { ...store.realtime, ...partial, updatedAt: now() };
  writeStore(store);
  return store.realtime;
}

export function ingestPush(partial: Partial<PushSnapshot>) {
  const store = readStore();
  store.push = { ...store.push, ...partial, updatedAt: now() };
  writeStore(store);
  return store.push;
}

export function ingestDelivery(events: Omit<DeliveryEvent, 'id'>[]) {
  const store = readStore();
  const mapped = events.map((e) => ({ ...e, id: newId('dlv') }));
  store.deliveryEvents = [...mapped, ...store.deliveryEvents].slice(0, 5000);
  writeStore(store);
  return { accepted: mapped.length };
}

export function ingestBlockStats(stats: BlockStats) {
  const store = readStore();
  store.blocks = { ...stats, updatedAt: now() };
  writeStore(store);
  return store.blocks;
}

export { CAPABILITIES };
