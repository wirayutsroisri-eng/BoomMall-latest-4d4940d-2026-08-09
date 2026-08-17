import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/adminAuth';
import { AppError } from '../lib/errors';
import * as chat from '../services/chatAdmin/service';

function actor(req: AuthedRequest) {
  return req.adminActor ?? 'admin';
}

function role(req: AuthedRequest) {
  return req.adminRole ?? 'ADMIN';
}

export function getChatDashboard(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: chat.getChatDashboard() });
}

export function getChatReports(req: AuthedRequest, res: Response) {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ ok: true, data: chat.listChatReports(status) });
}

export function postChatReport(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const reportedUserId = String(body.reportedUserId ?? '');
  const conversationId = String(body.conversationId ?? '');
  const messageId = String(body.messageId ?? '');
  const reason = String(body.reason ?? '');
  const messageBody = String(body.messageBody ?? '');
  if (!reportedUserId || !conversationId || !messageId || !reason || !messageBody) {
    throw new AppError(
      'VALIDATION',
      'reportedUserId, conversationId, messageId, reason, messageBody required',
      400,
    );
  }
  const report = chat.ingestChatReport({
    reporterRef: String(body.reporterRef ?? actor(req)),
    reportedUserId,
    conversationId,
    messageId,
    messageBody,
    reason,
    riskScore: body.riskScore != null ? Number(body.riskScore) : undefined,
    previousViolations:
      body.previousViolations != null ? Number(body.previousViolations) : undefined,
  });
  res.status(201).json({ ok: true, data: report });
}

export function postResolveChatReport(req: AuthedRequest, res: Response) {
  const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body ?? {};
  const result = chat.resolveChatReport({
    reportId: String(reportId),
    action: body.action,
    adminId: actor(req),
    role: role(req),
    note: body.note ? String(body.note) : undefined,
    confirmPermanentBan: Boolean(body.confirmPermanentBan),
  });
  res.json({ ok: true, data: result });
}

export function postMessageAccess(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const result = chat.openMessageAccessCase({
    adminId: actor(req),
    role: role(req),
    reportId: body.reportId ? String(body.reportId) : undefined,
    conversationId: String(body.conversationId ?? ''),
    messageId: String(body.messageId ?? ''),
    reason: String(body.reason ?? ''),
  });
  res.json({ ok: true, data: result });
}

export function getPolicies(_req: AuthedRequest, res: Response) {
  res.json({
    ok: true,
    data: {
      active: chat.getActivePolicy(),
      versions: chat.listPolicies(),
    },
  });
}

export function postPolicyDraft(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const draft = chat.savePolicyDraft({
    actor: actor(req),
    role: role(req),
    basePolicyId: body.basePolicyId ? String(body.basePolicyId) : undefined,
    version: String(body.version ?? ''),
    sensitivity: body.sensitivity,
    detections: body.detections,
    antiSpam: body.antiSpam,
    riskThresholds: body.riskThresholds,
    policyPrompt: String(body.policyPrompt ?? ''),
  });
  if (!draft.version) throw new AppError('VALIDATION', 'version required', 400);
  res.status(201).json({ ok: true, data: draft });
}

export function postPolicyStatus(req: AuthedRequest, res: Response) {
  const policyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body ?? {};
  const status = String(body.status ?? '') as chat.PolicyStatus;
  if (!['draft', 'test', 'active', 'archived'].includes(status)) {
    throw new AppError('VALIDATION', 'invalid status', 400);
  }
  const policy = chat.setPolicyStatus({
    policyId: String(policyId),
    status,
    actor: actor(req),
    role: role(req),
  });
  res.json({ ok: true, data: policy });
}

export function postPolicyRollback(req: AuthedRequest, res: Response) {
  const policyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const policy = chat.rollbackPolicy({
    policyId: String(policyId),
    actor: actor(req),
    role: role(req),
  });
  res.json({ ok: true, data: policy });
}

export function getDelivery(req: AuthedRequest, res: Response) {
  res.json({
    ok: true,
    data: chat.listDelivery({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
      conversationId:
        typeof req.query.conversationId === 'string' ? req.query.conversationId : undefined,
      errorType: typeof req.query.errorType === 'string' ? req.query.errorType : undefined,
      since: typeof req.query.since === 'string' ? req.query.since : undefined,
    }),
  });
}

export function getRealtime(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: chat.getRealtimeMonitor() });
}

export function getNotifications(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: chat.getPushMonitor() });
}

export function getBlocks(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: chat.getBlockStats() });
}

export function getRestrictions(req: AuthedRequest, res: Response) {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  res.json({ ok: true, data: chat.getRestrictions(userId) });
}

export function postRestrictions(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const row = chat.setRestrictions({
    userId: String(body.userId ?? ''),
    capabilities: body.capabilities ?? {},
    reason: String(body.reason ?? ''),
    actor: actor(req),
    role: role(req),
  });
  if (!body.userId) throw new AppError('VALIDATION', 'userId required', 400);
  res.json({ ok: true, data: row });
}

export function getAnalytics(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: chat.getChatAnalytics() });
}

export function getEmergency(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: chat.getEmergency() });
}

export function postEmergency(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const data = chat.setEmergency({
    actor: actor(req),
    role: role(req),
    patch: body.patch ?? {},
    confirm: Boolean(body.confirm),
    reason: String(body.reason ?? ''),
  });
  res.json({ ok: true, data });
}

export function getChatAudit(req: AuthedRequest, res: Response) {
  const limit = Number(req.query.limit ?? 50);
  res.json({ ok: true, data: chat.listChatAudit(Number.isFinite(limit) ? limit : 50) });
}

export function getAccessAudit(req: AuthedRequest, res: Response) {
  const limit = Number(req.query.limit ?? 50);
  res.json({ ok: true, data: chat.listAccessAudit(Number.isFinite(limit) ? limit : 50) });
}

/** Chat worker ingest — protected by CHAT_SERVICE_API_KEY or admin key */
export function postIngest(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const kind = String(body.kind ?? '');
  if (kind === 'runtime') {
    return res.json({ ok: true, data: chat.ingestRuntime(body.data ?? {}) });
  }
  if (kind === 'realtime') {
    return res.json({ ok: true, data: chat.ingestRealtime(body.data ?? {}) });
  }
  if (kind === 'push') {
    return res.json({ ok: true, data: chat.ingestPush(body.data ?? {}) });
  }
  if (kind === 'delivery') {
    return res.json({ ok: true, data: chat.ingestDelivery(body.events ?? []) });
  }
  if (kind === 'blocks') {
    return res.json({ ok: true, data: chat.ingestBlockStats(body.data) });
  }
  if (kind === 'report') {
    const report = chat.ingestChatReport(body.data);
    return res.status(201).json({ ok: true, data: report });
  }
  throw new AppError('VALIDATION', 'Unknown ingest kind', 400);
}
