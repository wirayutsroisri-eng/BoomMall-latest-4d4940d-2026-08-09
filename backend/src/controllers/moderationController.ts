import type { Response, NextFunction, Request } from 'express';
import type { AuthedRequest } from '../middleware/adminAuth';
import { AppError } from '../lib/errors';
import {
  banUser,
  createReport,
  getPublicContentBlocks,
  getUser,
  hardDeleteUser,
  listAudit,
  listBlacklist,
  listContentActions,
  listKeywords,
  listReports,
  listUsers,
  moderationStats,
  quarantineIfKeywordHit,
  resolveReport,
  restoreContent,
  setContentStatus,
  unlockUser,
  type ContentModerationStatus,
  type ReportKind,
  type SocialProvider,
} from '../services/moderation';
import { runLockUnlockAlgorithm } from '../services/trustSafety/service';
import { bumpSocialPostReport } from '../modules/feed/SocialPostService';

export function getModerationStats(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: moderationStats() });
}

export function getModerationReports(req: AuthedRequest, res: Response) {
  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  res.json({ ok: true, data: listReports(status) });
}

export function postModerationReport(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const body = req.body ?? {};
    const kind = body.kind as ReportKind;
    const targetId = String(body.targetId ?? '').trim();
    const reason = String(body.reason ?? '').trim();
    if (!kind || !targetId || !reason) {
      throw new AppError('VALIDATION', 'kind, targetId, reason required', 400);
    }
    const result = createReport({
      kind,
      targetId,
      targetLabel: body.targetLabel ? String(body.targetLabel) : undefined,
      reason,
      details: body.details ? String(body.details) : undefined,
      reporterRef: body.reporterRef ? String(body.reporterRef) : req.adminActor,
    });
    res.status(201).json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
}

/** Public report ingest from mobile (no admin key) */
export function postPublicReport(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body ?? {};
    const kind = body.kind as ReportKind;
    const targetId = String(body.targetId ?? '').trim();
    const reason = String(body.reason ?? '').trim();
    if (!kind || !targetId || !reason) {
      throw new AppError('VALIDATION', 'kind, targetId, reason required', 400);
    }
    const result = createReport({
      kind,
      targetId,
      targetLabel: body.targetLabel ? String(body.targetLabel) : undefined,
      reason,
      details: body.details ? String(body.details) : undefined,
      reporterRef: body.reporterRef ? String(body.reporterRef) : 'app-user',
    });
    // Algorithm applies soft-lock / AUTO_HIDDEN / unlock from active NL policies (App Store 1.2)
    void runLockUnlockAlgorithm({ actor: 'algorithm', trigger: 'user_report' }).catch(() => {
      /* non-fatal */
    });
    if (kind === 'content' && targetId) {
      void bumpSocialPostReport(targetId).catch(() => undefined);
    }
    res.status(201).json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
}

export function postResolveReport(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const action = req.body?.action as
      | 'hide_content'
      | 'remove_content'
      | 'dismiss'
      | 'mark_reviewed'
      | 'hide'
      | 'remove';
    if (!reportId || !action) {
      throw new AppError('VALIDATION', 'report id and action required', 400);
    }
    const result = resolveReport({
      reportId,
      actor: req.adminActor ?? 'admin',
      action,
      note: req.body?.note ? String(req.body.note) : undefined,
    });
    if (!result) throw new AppError('NOT_FOUND', 'Report not found', 404);
    res.json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
}

export function getModeratedContent(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: listContentActions() });
}

export function postContentAction(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const contentId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '',
    ).trim();
    const action = String(req.body?.action ?? '').trim() as
      | 'hide'
      | 'remove'
      | 'restore'
      | ContentModerationStatus;
    if (!contentId || !action) {
      throw new AppError('VALIDATION', 'content id and action required', 400);
    }

    if (action === 'restore') {
      const restored = restoreContent(contentId, req.adminActor ?? 'admin');
      if (!restored) throw new AppError('NOT_FOUND', 'Content action not found', 404);
      res.json({ ok: true, data: { restored: true, previous: restored } });
      return;
    }

    const status: ContentModerationStatus =
      action === 'hide' || action === 'hidden'
        ? 'hidden'
        : action === 'pending_review'
          ? 'pending_review'
          : 'removed';
    const record = setContentStatus({
      contentId,
      status,
      reason: req.body?.reason
        ? String(req.body.reason)
        : status === 'hidden'
          ? 'blocked'
          : 'removed',
      actor: req.adminActor ?? 'admin',
      authorHandle: req.body?.authorHandle ? String(req.body.authorHandle) : undefined,
      authorUserId: req.body?.authorUserId ? String(req.body.authorUserId) : undefined,
      captionPreview: req.body?.captionPreview ? String(req.body.captionPreview) : undefined,
    });
    res.json({ ok: true, data: record });
  } catch (e) {
    next(e);
  }
}

export function getPublicBlocks(_req: Request, res: Response) {
  res.json({ ok: true, data: getPublicContentBlocks() });
}

export function getModerationUsers(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: listUsers() });
}

export function getModerationUser(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const user = id ? getUser(id) : null;
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    res.json({ ok: true, data: user });
  } catch (e) {
    next(e);
  }
}

/** POST /api/v1/admin/users/:id/ban — Lock account (requires user report · App Store 1.2) */
export function postBanUser(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!userId) throw new AppError('VALIDATION', 'user id required', 400);
    const reason = String(req.body?.reason ?? '').trim();
    const reportId = String(req.body?.reportId ?? '').trim();
    if (!reason) throw new AppError('VALIDATION', 'reason required', 400);
    if (!reportId) {
      throw new AppError(
        'REPORT_REQUIRED',
        'App Store 1.2: ต้องมีรายงานจากผู้ใช้ (reportId) ก่อนล็อกบัญชี',
        400,
      );
    }
    const mode = req.body?.mode === 'soft' ? 'soft' : 'hard';
    const result = banUser({
      userId,
      actor: req.adminActor ?? 'admin',
      reason,
      mode,
      reportId,
    });
    if (!result) throw new AppError('NOT_FOUND', 'User not found', 404);
    res.json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
}

/** POST /api/v1/admin/users/:id/unlock — Unlock after review */
export function postUnlockUser(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!userId) throw new AppError('VALIDATION', 'user id required', 400);
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) throw new AppError('VALIDATION', 'unlock reason required', 400);
    const result = unlockUser({
      userId,
      actor: req.adminActor ?? 'admin',
      reason,
      reportId: req.body?.reportId ? String(req.body.reportId) : undefined,
    });
    if (!result) throw new AppError('NOT_FOUND', 'User not found', 404);
    res.json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
}

/** DELETE /api/v1/admin/users/:id/hard-delete */
export function deleteHardUser(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!userId) throw new AppError('VALIDATION', 'user id required', 400);
    const user = hardDeleteUser({
      userId,
      actor: req.adminActor ?? 'admin',
      reason: req.body?.reason ? String(req.body.reason) : undefined,
    });
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    res.json({ ok: true, data: user });
  } catch (e) {
    next(e);
  }
}

export function getBlacklist(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: listBlacklist() });
}

export function getAuditLog(req: AuthedRequest, res: Response) {
  const limit = Number(req.query.limit ?? 50);
  res.json({ ok: true, data: listAudit(Number.isFinite(limit) ? limit : 50) });
}

export function getKeywords(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: listKeywords() });
}

export function postKeywordScan(req: Request, res: Response, next: NextFunction) {
  try {
    const contentId = String(req.body?.contentId ?? '').trim();
    const text = String(req.body?.text ?? '');
    if (!contentId || !text) throw new AppError('VALIDATION', 'contentId and text required', 400);
    const actor =
      (req as AuthedRequest).adminActor ??
      (req.body?.authorUserId ? String(req.body.authorUserId) : 'system');
    const result = quarantineIfKeywordHit({
      contentId,
      text,
      authorUserId: req.body?.authorUserId ? String(req.body.authorUserId) : undefined,
      authorHandle: req.body?.authorHandle ? String(req.body.authorHandle) : undefined,
      actor,
    });
    res.json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
}

/** Social login exchange — Apple JWKS / JWT session */
export async function postSocialLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const { exchangeSocialLogin } = await import('../modules/auth/AuthService');
    const provider = String(req.body?.provider ?? '').trim() as SocialProvider;
    const data = await exchangeSocialLogin({
      provider,
      providerUserId: String(req.body?.providerUserId ?? '').trim(),
      displayName: req.body?.displayName ? String(req.body.displayName) : undefined,
      handle: req.body?.handle ? String(req.body.handle) : undefined,
      identityToken: req.body?.identityToken ? String(req.body.identityToken) : undefined,
    });
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
}
