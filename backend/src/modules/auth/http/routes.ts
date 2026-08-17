import { Router } from 'express';
import type { Response } from 'express';
import {
  requireAdmin,
  requirePermission,
  listAdminPermissions,
} from '../../../middleware/adminAuth';
import type { AuthedRequest } from '../../../middleware/adminAuth';
import { requireUser } from '../../../middleware/userAuth';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import {
  acceptEula,
  authDomainStatus,
  getProfile,
  listProfiles,
  upsertProfile,
  EULA_CHAT_C4,
  EULA_MARKETPLACE,
  EULA_PRIVACY,
} from '../ProfileService';
import {
  exchangeSocialLogin,
  loginEmail,
  registerEmail,
  requestPhoneOtp,
  verifyPhoneOtp,
} from '../AuthService';
import { authDomainJwtStatus } from '../JwtService';
import { followCounts, followUser, listFollowers, listFollowing, unfollowUser } from '../FollowService';
import { adminResetPassword, adminSetUserRole, deleteOwnAccount } from '../AccountService';

export const authDomainRouter = Router();

authDomainRouter.get('/status', (_req, res) => {
  res.json({
    ok: true,
    data: {
      ...authDomainStatus(),
      jwt: authDomainJwtStatus(),
      rbac: {
        adminRoles: ['SUPER_ADMIN', 'ADMIN', 'SAFETY', 'ADS', 'FEED', 'MARKETPLACE', 'FINANCE'],
        adminPermissionsSample: listAdminPermissions('ADMIN'),
      },
      stack: 'express',
    },
  });
});

/** Sign in with Apple / social → JWT */
authDomainRouter.post('/login/social', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await exchangeSocialLogin({
        provider: String(body.provider ?? '').trim() as 'apple' | 'google' | 'line' | 'facebook',
        providerUserId: String(body.providerUserId ?? '').trim(),
        displayName: body.displayName ? String(body.displayName) : undefined,
        handle: body.handle ? String(body.handle) : undefined,
        identityToken: body.identityToken ? String(body.identityToken) : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.post('/otp/request', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await requestPhoneOtp({
        phone: String(body.phone ?? ''),
        ipHint: req.ip,
      }),
    });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.post('/otp/verify', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await verifyPhoneOtp({
        phone: String(body.phone ?? ''),
        code: String(body.code ?? body.otp ?? ''),
      }),
    });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.post('/register', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    res.status(201).json({
      ok: true,
      data: await registerEmail({
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        displayName: body.displayName ? String(body.displayName) : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.post('/login', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await loginEmail({
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
      }),
    });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.get('/users', requireAdmin, requirePermission('users:moderate'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listProfiles(200) });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.get('/me', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    const profile = await getProfile(req.user!.sub);
    res.json({
      ok: true,
      data: {
        userId: req.user!.sub,
        role: req.user!.role,
        provider: req.user!.provider,
        profile,
      },
    });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.get('/profiles/:userId', async (req, res, next) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    res.json({ ok: true, data: await getProfile(String(userId)) });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.post('/profiles', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    res.status(201).json({
      ok: true,
      data: await upsertProfile({
        userId: req.user!.sub,
        displayName: body.displayName ? String(body.displayName) : undefined,
        handle: body.handle ? String(body.handle) : undefined,
        shopId: body.shopId ? String(body.shopId) : undefined,
        bio: body.bio != null ? String(body.bio) : undefined,
        avatarUrl: body.avatarUrl ? String(body.avatarUrl) : undefined,
        coverUrl: body.coverUrl ? String(body.coverUrl) : undefined,
        privacy: body.privacy,
      }),
    });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.post('/eula/accept', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    res.status(201).json({
      ok: true,
      data: await acceptEula({
        userId: req.user!.sub,
        policyKey: String(body.policyKey ?? EULA_CHAT_C4),
        version: String(body.version ?? 'c4-2026.1'),
        ipHint: req.ip,
        userAgent: req.header('user-agent') ?? undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.get('/eula/catalog', (_req, res) => {
  res.json({
    ok: true,
    data: [
      { key: EULA_CHAT_C4, title: 'Chat & UGC EULA (App Store C4)', version: 'c4-2026.1' },
      { key: EULA_MARKETPLACE, title: 'Marketplace Terms', version: 'mp-2026.1' },
      { key: EULA_PRIVACY, title: 'Privacy Policy', version: 'privacy-2026.1' },
    ],
  });
});

authDomainRouter.post('/follows', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    const handle = String(req.body?.handle ?? req.body?.followingHandle ?? '');
    res.status(201).json({ ok: true, data: await followUser(req.user!.sub, handle) });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.delete('/follows', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    const handle = String(req.body?.handle ?? req.query.handle ?? '');
    res.json({ ok: true, data: await unfollowUser(req.user!.sub, handle) });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.get('/follows/following', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    res.json({ ok: true, data: await listFollowing(req.user!.sub) });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.get('/follows/followers', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.user!.sub);
    res.json({ ok: true, data: await listFollowers(userId) });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.get('/follows/counts/:userId', async (req, res, next) => {
  try {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    res.json({ ok: true, data: await followCounts(String(userId)) });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.delete('/me', requireUser, async (req: UserAuthedRequest, res, next) => {
  try {
    res.json({ ok: true, data: await deleteOwnAccount(req.user!.sub, req.user!.sub) });
  } catch (e) {
    next(e);
  }
});

authDomainRouter.post(
  '/users/:userId/role',
  requireAdmin,
  requirePermission('users:moderate'),
  async (req, res, next) => {
    try {
      const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      res.json({ ok: true, data: await adminSetUserRole(String(userId), String(req.body?.role ?? '')) });
    } catch (e) {
      next(e);
    }
  },
);

authDomainRouter.post(
  '/users/:userId/reset-password',
  requireAdmin,
  requirePermission('users:moderate'),
  async (req, res, next) => {
    try {
      const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      res.json({ ok: true, data: await adminResetPassword(String(userId)) });
    } catch (e) {
      next(e);
    }
  },
);

authDomainRouter.get('/admin/status', requireAdmin, (_req: AuthedRequest, res: Response) => {
  res.json({
    ok: true,
    data: {
      ...authDomainStatus(),
      jwt: authDomainJwtStatus(),
      permissions: listAdminPermissions(_req.adminRole ?? 'ADMIN'),
    },
  });
});
