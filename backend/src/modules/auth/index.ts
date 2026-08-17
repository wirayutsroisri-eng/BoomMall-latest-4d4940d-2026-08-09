/**
 * Auth & Profile domain public surface.
 */

export {
  listProfiles,
  upsertProfile,
  getProfile,
  acceptEula,
  hasAcceptedEula,
  authDomainStatus,
  EULA_CHAT_C4,
  EULA_MARKETPLACE,
  EULA_PRIVACY,
} from './ProfileService';
export { exchangeSocialLogin, registerEmail, loginEmail } from './AuthService';
export { signAppJwt, verifyAppJwt, authDomainJwtStatus } from './JwtService';
export { verifyAppleIdentityToken } from './AppleAuth';
export {
  requireAdmin,
  requireAdminRole,
  requireSuperAdmin,
  requirePermission,
  listAdminPermissions,
} from '../../middleware/adminAuth';
export type { AuthedRequest, AdminRole, AdminPermission } from '../../middleware/adminAuth';
export { requireUser, requireUserOrDevHeader, requireAuth, authedUserId } from '../../middleware/userAuth';
export { getAdminMe } from '../../controllers/sessionController';
export { authDomainRouter } from './http/routes';
