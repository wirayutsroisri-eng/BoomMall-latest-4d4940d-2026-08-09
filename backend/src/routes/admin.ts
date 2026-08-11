import { Router } from 'express';
import { requireAdmin, requireAdminRole } from '../middleware/adminAuth';
import { getAdminDashboardStats } from '../controllers/dashboardController';
import { getAdminMe } from '../controllers/sessionController';
import {
  getTopUps,
  postApproveTopUp,
  postCreateTopUp,
} from '../controllers/topupController';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

/** GET /api/v1/admin/me — role gate for Admin Portal */
adminRouter.get('/me', getAdminMe);

/** Handbook is ADMIN-only (explicit role check for future multi-role keys) */
adminRouter.get('/handbook/access', requireAdminRole, (_req, res) => {
  res.json({ ok: true, data: { allowed: true, role: 'ADMIN' } });
});

/** GET /api/v1/admin/dashboard/stats */
adminRouter.get('/dashboard/stats', getAdminDashboardStats);

/** GET /api/v1/admin/topup */
adminRouter.get('/topup', getTopUps);

/** POST /api/v1/admin/topup — create request (seller / ops helper) */
adminRouter.post('/topup', postCreateTopUp);

/** POST /api/v1/admin/topup/approve — mint coins + credit seller (idempotent) */
adminRouter.post('/topup/approve', postApproveTopUp);
