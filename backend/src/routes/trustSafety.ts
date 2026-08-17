import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getAppeals,
  getAudit,
  getAutoMod,
  getAlgorithm,
  getAlgorithmDirectives,
  getAlgorithmRuns,
  getModerationPolicies,
  getModerationStates,
  getCases,
  getLists,
  getOverview,
  getPolicies,
  getProposals,
  getReports,
  getUserProfile,
  postAppeal,
  postAppealDecision,
  postAlgorithmDirective,
  postAlgorithmRun,
  postAutoMod,
  postCase,
  postCaseAction,
  postList,
  postPolicyDraft,
  postPolicyPrompt,
  postPolicyPromptDecision,
  postPolicyStatus,
  postUserCapabilities,
} from '../controllers/trustSafetyController';

/** Trust & Safety Control Center — /api/v1/admin/safety */
export const trustSafetyRouter = Router();

trustSafetyRouter.use(requireAdmin);

trustSafetyRouter.get('/overview', getOverview);
trustSafetyRouter.get('/reports', getReports);
trustSafetyRouter.get('/cases', getCases);
trustSafetyRouter.post('/cases', postCase);
trustSafetyRouter.post('/cases/:id/action', postCaseAction);
trustSafetyRouter.get('/users/:id/profile', getUserProfile);
trustSafetyRouter.post('/users/:id/capabilities', postUserCapabilities);
trustSafetyRouter.get('/automod', getAutoMod);
trustSafetyRouter.post('/automod', postAutoMod);
trustSafetyRouter.get('/algorithm', getAlgorithm);
trustSafetyRouter.get('/algorithm/directives', getAlgorithmDirectives);
trustSafetyRouter.get('/algorithm/runs', getAlgorithmRuns);
trustSafetyRouter.get('/algorithm/policies', getModerationPolicies);
trustSafetyRouter.get('/algorithm/states', getModerationStates);
trustSafetyRouter.post('/algorithm/directive', postAlgorithmDirective);
trustSafetyRouter.post('/algorithm/run', postAlgorithmRun);
trustSafetyRouter.get('/policy', getPolicies);
trustSafetyRouter.post('/policy/draft', postPolicyDraft);
trustSafetyRouter.post('/policy/:id/status', postPolicyStatus);
trustSafetyRouter.post('/policy/prompt', postPolicyPrompt);
trustSafetyRouter.get('/policy/proposals', getProposals);
trustSafetyRouter.post('/policy/proposals/:id/decision', postPolicyPromptDecision);
trustSafetyRouter.get('/lists', getLists);
trustSafetyRouter.post('/lists', postList);
trustSafetyRouter.get('/appeals', getAppeals);
trustSafetyRouter.post('/appeals', postAppeal);
trustSafetyRouter.post('/appeals/:id/decision', postAppealDecision);
trustSafetyRouter.get('/audit', getAudit);
