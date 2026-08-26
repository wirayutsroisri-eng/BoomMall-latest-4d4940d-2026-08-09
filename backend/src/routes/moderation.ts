import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import { requireUserOrDevHeader } from '../middleware/userAuth';
import {
  deleteHardUser,
  getAuditLog,
  getBlacklist,
  getKeywords,
  getModeratedContent,
  getModerationReports,
  getModerationStats,
  getModerationUser,
  getModerationUsers,
  getPublicBlocks,
  postBanUser,
  postContentAction,
  postKeywordScan,
  postModerationReport,
  postPublicReport,
  postSecondhandReport,
  postResolveReport,
  postSocialLogin,
  postUnlockUser,
} from '../controllers/moderationController';

/** Public surfaces for mobile app */
export const moderationPublicRouter = Router();
moderationPublicRouter.get('/content-blocks', getPublicBlocks);
moderationPublicRouter.post('/reports', requireUserOrDevHeader, postPublicReport);
moderationPublicRouter.post('/secondhand/reports', requireUserOrDevHeader, postSecondhandReport);
moderationPublicRouter.post('/auth/social', postSocialLogin);
moderationPublicRouter.post('/keywords/scan', postKeywordScan);

/** Admin moderation — requires ADMIN_API_KEY */
export const moderationAdminRouter = Router();
moderationAdminRouter.use(requireAdmin);
moderationAdminRouter.get('/stats', getModerationStats);
moderationAdminRouter.get('/reports', getModerationReports);
moderationAdminRouter.post('/reports', postModerationReport);
moderationAdminRouter.post('/reports/:id/action', postResolveReport);
moderationAdminRouter.get('/content', getModeratedContent);
moderationAdminRouter.post('/content/:id/action', postContentAction);
moderationAdminRouter.get('/users', getModerationUsers);
moderationAdminRouter.get('/users/:id', getModerationUser);
moderationAdminRouter.post('/users/:id/ban', postBanUser);
moderationAdminRouter.post('/users/:id/unlock', postUnlockUser);
moderationAdminRouter.delete('/users/:id/hard-delete', deleteHardUser);
moderationAdminRouter.get('/blacklist', getBlacklist);
moderationAdminRouter.get('/audit', getAuditLog);
moderationAdminRouter.get('/keywords', getKeywords);
moderationAdminRouter.post('/keywords/scan', postKeywordScan);
