/**
 * End-user JWT auth middleware for Core API routes.
 * Implementation lives in auth.middleware.ts (jose + JWT `sub`).
 */

export {
  authedUserId,
  requireAuth,
  requireUser,
  optionalUser,
  requireUserOrDevHeader,
  type AuthenticatedRequest,
  type UserAuthedRequest,
} from './auth.middleware';
