import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import { getAdminDashboardStats } from '../controllers/dashboardController';
import { getAdminMe } from '../controllers/sessionController';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

/** GET /api/v1/admin/me — role gate for Admin Portal */
adminRouter.get('/me', getAdminMe);

/** GET /api/v1/admin/dashboard/stats */
adminRouter.get('/dashboard/stats', getAdminDashboardStats);
