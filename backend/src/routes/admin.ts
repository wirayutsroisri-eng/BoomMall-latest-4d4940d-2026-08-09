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

/** ตัด Boom Coin / mint / top-up — ไม่ผ่าน App Store */
adminRouter.all('/topup', (_req, res) => {
  res.status(410).json({ ok: false, error: { message: 'Boom Coin top-up ถูกถอดออกจากระบบ' } });
});
adminRouter.all('/topup/approve', (_req, res) => {
  res.status(410).json({ ok: false, error: { message: 'Boom Coin top-up ถูกถอดออกจากระบบ' } });
});
adminRouter.get('/handbook/access', (_req, res) => {
  res.status(410).json({ ok: false, error: { message: 'คู่มือเหรียญถูกถอดออกจากระบบ' } });
});
