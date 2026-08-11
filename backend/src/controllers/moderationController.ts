import type { Response, NextFunction, Request } from 'express';
import type { AuthedRequest } from '../middleware/adminAuth';
import { AppError } from '../lib/errors';
import {
  banUser,
  createReport,
  getPublicContentBlocks,
  getUser,
  hardDeleteUser,
  isSocialBlacklisted,
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
  upsertUser,
  type ContentModerationStatus,
  type ReportKind,
  type SocialProvider,
} from '../services/moderation';

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

/** POST /api/v1/admin/users/:id/ban */
export function postBanUser(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!userId) throw new AppError('VALIDATION', 'user id required', 400);
    const reason = String(req.body?.reason ?? 'policy violation').trim();
    const mode = req.body?.mode === 'soft' ? 'soft' : 'hard';
    const result = banUser({
      userId,
      actor: req.adminActor ?? 'admin',
      reason,
      mode,
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

/** Social login exchange — checks blacklist, upserts user, returns session */
export function postSocialLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const provider = String(req.body?.provider ?? '').trim() as SocialProvider;
    const providerUserId = String(req.body?.providerUserId ?? '').trim();
    const displayName = String(req.body?.displayName ?? 'BoomMall User').trim();
    const handle = req.body?.handle ? String(req.body.handle) : undefined;
    const identityToken = req.body?.identityToken ? String(req.body.identityToken) : undefined;

    if (!['apple', 'google', 'line'].includes(provider) || !providerUserId) {
      throw new AppError('VALIDATION', 'provider and providerUserId required', 400);
    }

    const blocked = isSocialBlacklisted(provider, providerUserId);
    if (blocked) {
      throw new AppError('FORBIDDEN', 'This social account is banned from BoomMall', 403);
    }

    // Production: verify identityToken with Apple/Google/LINE JWKS.
    // Here we accept the client assertion after format checks for demo ops.
    if (identityToken && identityToken.length < 10) {
      throw new AppError('UNAUTHORIZED', 'Invalid identity token', 401);
    }

    const userId = `${provider}_${providerUserId}`.slice(0, 64);
    const existing = getUser(userId);
    if (existing?.status === 'banned' || existing?.status === 'soft_banned') {
      throw new AppError('FORBIDDEN', 'Account suspended', 403);
    }
    if (existing?.status === 'hard_deleted') {
      throw new AppError('FORBIDDEN', 'Account deleted', 403);
    }

    const user = upsertUser({
      id: userId,
      displayName,
      handle,
      social: { [provider]: providerUserId },
    });

    const sessionToken = Buffer.from(
      JSON.stringify({ sub: user.id, provider, iat: Date.now() }),
    ).toString('base64url');

    res.json({
      ok: true,
      data: {
        sessionToken,
        user: {
          id: user.id,
          displayName: user.displayName,
          handle: user.handle,
          status: user.status,
          provider,
        },
      },
    });
  } catch (e) {
    next(e);
  }
}
