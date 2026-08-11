import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/adminAuth';

/** GET /api/v1/admin/me — session + role for Admin Portal gate */
export function getAdminMe(req: AuthedRequest, res: Response) {
  res.json({
    ok: true,
    data: {
      actor: req.adminActor ?? 'admin',
      role: req.adminRole ?? 'ADMIN',
      permissions: {
        dashboard: true,
        topupApprove: true,
        handbook: true,
        ledgerReconcile: true,
        moderation: true,
      },
      issuedAt: new Date().toISOString(),
    },
  });
}
