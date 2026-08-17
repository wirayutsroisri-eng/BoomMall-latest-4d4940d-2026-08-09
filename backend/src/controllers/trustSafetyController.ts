import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/adminAuth';
import { AppError } from '../lib/errors';
import * as ts from '../services/trustSafety/service';

function actor(req: AuthedRequest) {
  return req.adminActor ?? 'admin';
}

export function getOverview(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: ts.getSafetyOverview() });
}

export function getReports(req: AuthedRequest, res: Response) {
  res.json({
    ok: true,
    data: ts.listSafetyReports({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      reason: typeof req.query.reason === 'string' ? req.query.reason : undefined,
      kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
      riskMin: req.query.riskMin != null ? Number(req.query.riskMin) : undefined,
    }),
  });
}

export function getCases(req: AuthedRequest, res: Response) {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ ok: true, data: ts.listCases(status) });
}

export function postCase(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const reportIds = Array.isArray(body.reportIds) ? body.reportIds.map(String) : [];
  const c = ts.createCaseFromReports({
    reportIds,
    actor: actor(req),
    userId: body.userId ? String(body.userId) : undefined,
    contentId: body.contentId ? String(body.contentId) : undefined,
  });
  res.status(201).json({ ok: true, data: c });
}

export function postCaseAction(req: AuthedRequest, res: Response) {
  const caseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body ?? {};
  const c = ts.actOnCase({
    caseId: String(caseId),
    action: body.action,
    actor: actor(req),
    note: body.note ? String(body.note) : undefined,
    aiDecision: body.aiDecision,
  });
  res.json({ ok: true, data: c });
}

export function getUserProfile(req: AuthedRequest, res: Response) {
  const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!userId) throw new AppError('VALIDATION', 'user id required', 400);
  res.json({ ok: true, data: ts.getUserSafetyProfile(String(userId)) });
}

export function postUserCapabilities(req: AuthedRequest, res: Response) {
  const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body ?? {};
  const row = ts.setUserCapabilities({
    userId: String(userId),
    capabilities: body.capabilities ?? {},
    reason: String(body.reason ?? ''),
    actor: actor(req),
  });
  res.json({ ok: true, data: row });
}

export function getAutoMod(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: ts.getAutoMod() });
}

export function postAutoMod(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  res.json({ ok: true, data: ts.setAutoMod({ ...body, actor: actor(req) }) });
}

export async function getAlgorithm(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: await ts.getAlgorithmStatus() });
}

export function getAlgorithmDirectives(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: ts.listAlgorithmDirectives() });
}

export function getAlgorithmRuns(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: ts.listAlgorithmRuns() });
}

export async function getModerationStates(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: await ts.listModerationStates() });
}

export async function getModerationPolicies(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: await ts.listModerationPolicies() });
}

export async function postAlgorithmDirective(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  res.json({
    ok: true,
    data: await ts.postAlgorithmDirective({ text: String(body.text ?? ''), actor: actor(req) }),
  });
}

export async function postAlgorithmRun(req: AuthedRequest, res: Response) {
  res.json({
    ok: true,
    data: await ts.runLockUnlockAlgorithm({ actor: actor(req), trigger: 'admin_run' }),
  });
}

export function getPolicies(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: ts.listSafetyPolicies() });
}

export function postPolicyDraft(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const draft = ts.saveSafetyPolicyDraft({
    actor: actor(req),
    version: String(body.version ?? ''),
    instruction: String(body.instruction ?? ''),
    thresholds: body.thresholds,
    weights: body.weights,
  });
  res.status(201).json({ ok: true, data: draft });
}

export function postPolicyStatus(req: AuthedRequest, res: Response) {
  const policyId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body ?? {};
  res.json({
    ok: true,
    data: ts.setSafetyPolicyStatus({
      policyId: String(policyId),
      status: body.status,
      actor: actor(req),
    }),
  });
}

export function postPolicyPrompt(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  res.json({
    ok: true,
    data: ts.proposePolicyFromPrompt({ prompt: String(body.prompt ?? ''), actor: actor(req) }),
  });
}

export function postPolicyPromptDecision(req: AuthedRequest, res: Response) {
  const proposalId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body ?? {};
  res.json({
    ok: true,
    data: ts.decideProposedPolicy({
      proposalId: String(proposalId),
      decision: body.decision,
      actor: actor(req),
    }),
  });
}

export function getProposals(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: ts.listProposedPolicies() });
}

export function getLists(req: AuthedRequest, res: Response) {
  const kind = typeof req.query.kind === 'string' ? (req.query.kind as ts.ListKind) : undefined;
  res.json({ ok: true, data: ts.listExtendedLists(kind) });
}

export function postList(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const row = ts.addListEntry({
    kind: body.kind,
    type: body.type,
    value: String(body.value ?? ''),
    reason: String(body.reason ?? ''),
    actor: actor(req),
  });
  res.status(201).json({ ok: true, data: row });
}

export function getAppeals(req: AuthedRequest, res: Response) {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ ok: true, data: ts.listAppeals(status) });
}

export function postAppeal(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const a = ts.createAppeal({
    userId: String(body.userId ?? ''),
    targetType: body.targetType,
    targetId: String(body.targetId ?? ''),
    originalAction: String(body.originalAction ?? ''),
    originalReason: String(body.originalReason ?? ''),
    appealText: String(body.appealText ?? ''),
    evidence: body.evidence ? String(body.evidence) : undefined,
  });
  res.status(201).json({ ok: true, data: a });
}

export function postAppealDecision(req: AuthedRequest, res: Response) {
  const appealId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body ?? {};
  res.json({
    ok: true,
    data: ts.decideAppeal({
      appealId: String(appealId),
      decision: body.decision,
      actor: actor(req),
      note: body.note ? String(body.note) : undefined,
    }),
  });
}

export function getAudit(req: AuthedRequest, res: Response) {
  res.json({
    ok: true,
    data: ts.listSafetyAudit({
      admin: typeof req.query.admin === 'string' ? req.query.admin : undefined,
      action: typeof req.query.action === 'string' ? req.query.action : undefined,
      targetType: typeof req.query.targetType === 'string' ? req.query.targetType : undefined,
      limit: req.query.limit != null ? Number(req.query.limit) : 100,
    }),
  });
}
