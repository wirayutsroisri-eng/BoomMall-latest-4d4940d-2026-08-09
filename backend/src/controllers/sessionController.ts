import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/adminAuth';
import { deskForRole, navForDesk, sessionPermissions } from '../middleware/adminAuth';

/** GET /api/v1/admin/me — session + desk for Admin OS gate */
export function getAdminMe(req: AuthedRequest, res: Response) {
  const desk = req.adminDesk ?? deskForRole(req.adminRole ?? 'ADMIN');
  res.json({
    ok: true,
    data: {
      actor: req.adminActor ?? desk.defaultActor,
      role: desk.role,
      desk: desk.role,
      deskLabel: desk.label,
      home: desk.home,
      permissions: sessionPermissions(desk),
      nav: navForDesk(desk),
      issuedAt: new Date().toISOString(),
    },
  });
}
