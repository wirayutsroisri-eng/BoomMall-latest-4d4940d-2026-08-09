import { Router, type NextFunction, type Response } from 'express';
import {
  requireAdmin,
  requireSuperAdmin,
  resolveAdminAccess,
  type AuthedRequest,
} from '../middleware/adminAuth';
import { AppError } from '../lib/errors';
import {
  getAccessAudit,
  getAnalytics,
  getBlocks,
  getChatAudit,
  getChatDashboard,
  getChatReports,
  getDelivery,
  getEmergency,
  getNotifications,
  getPolicies,
  getRealtime,
  getRestrictions,
  postChatReport,
  postEmergency,
  postIngest,
  postMessageAccess,
  postPolicyDraft,
  postPolicyRollback,
  postPolicyStatus,
  postResolveChatReport,
  postRestrictions,
} from '../controllers/chatAdminController';

/**
 * Chat Admin API — separated service surface under platform admin.
 * Mount: /api/v1/admin/chat
 */
export const chatAdminRouter = Router();

chatAdminRouter.use(requireAdmin);

chatAdminRouter.get('/dashboard', getChatDashboard);
chatAdminRouter.get('/reports', getChatReports);
chatAdminRouter.post('/reports', postChatReport);
chatAdminRouter.post('/reports/:id/action', postResolveChatReport);
chatAdminRouter.post('/access/message', postMessageAccess);
chatAdminRouter.get('/access/audit', getAccessAudit);
chatAdminRouter.get('/policy', getPolicies);
chatAdminRouter.post('/policy/draft', postPolicyDraft);
chatAdminRouter.post('/policy/:id/status', postPolicyStatus);
chatAdminRouter.post('/policy/:id/rollback', postPolicyRollback);
chatAdminRouter.get('/delivery', getDelivery);
chatAdminRouter.get('/realtime', getRealtime);
chatAdminRouter.get('/notifications', getNotifications);
chatAdminRouter.get('/blocks', getBlocks);
chatAdminRouter.get('/restrictions', getRestrictions);
chatAdminRouter.post('/restrictions', postRestrictions);
chatAdminRouter.get('/analytics', getAnalytics);
chatAdminRouter.get('/emergency', getEmergency);
chatAdminRouter.post('/emergency', requireSuperAdmin, postEmergency);
chatAdminRouter.get('/audit', getChatAudit);

/**
 * Worker ingest for the Chat messaging service.
 * Auth: CHAT_SERVICE_API_KEY or admin key.
 */
export const chatIngestRouter = Router();

function requireChatServiceOrAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  const serviceKey = process.env.CHAT_SERVICE_API_KEY ?? '';
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const alt = req.header('x-chat-service-key')?.trim() ?? '';
  const presented = token || alt;

  if (serviceKey && presented === serviceKey) {
    req.adminActor = 'chat-service';
    req.adminRole = 'ADMIN';
    return next();
  }
  const desk = resolveAdminAccess(presented);
  if (desk) {
    req.adminDesk = desk;
    req.adminActor = req.header('x-admin-actor')?.trim() || desk.defaultActor;
    req.adminRole = desk.role;
    return next();
  }
  return next(new AppError('UNAUTHORIZED', 'Invalid chat service credentials', 401));
}

chatIngestRouter.use(requireChatServiceOrAdmin);
chatIngestRouter.post('/ingest', postIngest);
chatIngestRouter.post('/reports', postChatReport);
