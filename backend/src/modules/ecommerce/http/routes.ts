import { Router } from 'express';
import { requireAdmin, requirePermission, adminHasPermission } from '../../../middleware/adminAuth';
import type { AuthedRequest } from '../../../middleware/adminAuth';
import {
  ecommerceDomainStatus,
  getGpPolicy,
  listMarketplaceAudit,
  quoteOrderGp,
  settleMarketplaceOrder,
  updateGpPolicy,
} from '../GpLedgerService';
import { AppError } from '../../../lib/errors';
import { getPaymentGateway } from '../PspGateway';
import { listCatalog, upsertCatalogItem, catalogDomainStatus } from '../CatalogService';
import {
  adsDomainStatus,
  createCampaign,
  issueAdInvoice,
  listCampaigns,
  listInvoices,
  listActiveInventory,
  payAdInvoice,
  setCampaignStatus,
} from '../AdInventoryService';

export const ecommerceDomainRouter = Router();

ecommerceDomainRouter.use(requireAdmin);

ecommerceDomainRouter.get('/status', async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      data: {
        ...ecommerceDomainStatus(),
        catalog: catalogDomainStatus(),
        ads: adsDomainStatus(),
        gp: await getGpPolicy(),
      },
    });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.get('/gp/policy', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await getGpPolicy() });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.put('/gp/policy', async (req: AuthedRequest, res, next) => {
  try {
    const canWrite =
      adminHasPermission(req.adminRole, 'marketplace:write', req.adminDesk) ||
      adminHasPermission(req.adminRole, 'finance:write', req.adminDesk);
    if (!canWrite) {
      next(new AppError('FORBIDDEN', 'Missing permission: marketplace:write', 403));
      return;
    }
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await updateGpPolicy({
        enabled: body.enabled != null ? Boolean(body.enabled) : undefined,
        defaultGpBps: body.defaultGpBps != null ? Number(body.defaultGpBps) : undefined,
        b2cGpBps: body.b2cGpBps === null ? null : body.b2cGpBps != null ? Number(body.b2cGpBps) : undefined,
        b2bGpBps: body.b2bGpBps === null ? null : body.b2bGpBps != null ? Number(body.b2bGpBps) : undefined,
        minOrderThb: body.minOrderThb != null ? Number(body.minOrderThb) : undefined,
        holdDaysAfterComplete:
          body.holdDaysAfterComplete != null ? Number(body.holdDaysAfterComplete) : undefined,
        payoutCycleDays: body.payoutCycleDays != null ? Number(body.payoutCycleDays) : undefined,
        merchantOverrides: Array.isArray(body.merchantOverrides) ? body.merchantOverrides : undefined,
        actor: req.adminActor ?? 'admin',
      }),
    });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.post('/gp/quote', requirePermission('marketplace:read'), async (req, res, next) => {
  try {
    const q = await quoteOrderGp({
      amountThb: String(req.body?.amountThb ?? '0'),
      merchantId: req.body?.merchantId ? String(req.body.merchantId) : undefined,
      channel: req.body?.channel ? String(req.body.channel) : undefined,
      gpBps: req.body?.gpBps != null ? Number(req.body.gpBps) : undefined,
    });
    res.json({
      ok: true,
      data: {
        amountThb: q.amountThb.toString(),
        gpBps: q.gpBps,
        gpPercent: q.gpBps / 100,
        gpAmountThb: q.gpAmountThb.toString(),
        netToMerchantThb: q.netToMerchantThb.toString(),
      },
    });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.post(
  '/orders/settle',
  requirePermission('marketplace:write'),
  async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      const data = await settleMarketplaceOrder({
        orderId: String(body.orderId ?? ''),
        amountThb: String(body.amountThb ?? '0'),
        buyerRef: String(body.buyerRef ?? ''),
        merchantRef: String(body.merchantRef ?? ''),
        actor: req.adminActor ?? 'admin',
        gpBps: body.gpBps != null ? Number(body.gpBps) : undefined,
        idempotencyKey: String(body.idempotencyKey ?? `settle_${body.orderId}`),
      });
      res.json({
        ok: true,
        data: {
          quote: {
            ...data.quote,
            amountThb: data.quote.amountThb.toString(),
            gpAmountThb: data.quote.gpAmountThb.toString(),
            netToMerchantThb: data.quote.netToMerchantThb.toString(),
          },
          capture: data.capture,
          auditId: data.audit.id,
          pspProvider: getPaymentGateway().provider,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

ecommerceDomainRouter.get('/audit', requirePermission('marketplace:read'), async (req, res, next) => {
  try {
    const limit = req.query.limit != null ? Number(req.query.limit) : 50;
    res.json({ ok: true, data: await listMarketplaceAudit(limit) });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.get('/catalog', requirePermission('marketplace:read'), async (req, res, next) => {
  try {
    const kind = req.query.kind ? (String(req.query.kind) as 'PRODUCT' | 'SERVICE') : undefined;
    res.json({
      ok: true,
      data: await listCatalog({
        kind,
        merchantId: req.query.merchantId ? String(req.query.merchantId) : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.post('/catalog', requirePermission('marketplace:write'), async (req, res, next) => {
  try {
    const body = req.body ?? {};
    res.status(201).json({
      ok: true,
      data: await upsertCatalogItem({
        id: body.id ? String(body.id) : undefined,
        kind: String(body.kind ?? 'PRODUCT') as 'PRODUCT' | 'SERVICE',
        merchantId: String(body.merchantId ?? ''),
        title: String(body.title ?? ''),
        description: body.description ? String(body.description) : undefined,
        priceThb: String(body.priceThb ?? '0'),
        status: body.status ? String(body.status) : undefined,
        metadataJson: body.metadata,
      }),
    });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.get('/ads/campaigns', requirePermission('ads:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listCampaigns() });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.post('/ads/campaigns', requirePermission('ads:write'), async (req, res, next) => {
  try {
    const body = req.body ?? {};
    res.status(201).json({
      ok: true,
      data: await createCampaign({
        advertiserId: String(body.advertiserId ?? ''),
        name: String(body.name ?? ''),
        placement: String(body.placement ?? 'BANNER') as 'BANNER' | 'SPONSORED_FEED' | 'APP_OPEN',
        budgetThb: String(body.budgetThb ?? '0'),
        targeting:
          body.targeting && typeof body.targeting === 'object'
            ? {
                geo: body.targeting.geo ? String(body.targeting.geo) : undefined,
                channel: body.targeting.channel ? String(body.targeting.channel) : undefined,
              }
            : undefined,
        creative: body.creative
          ? {
              title: String(body.creative.title ?? body.name ?? 'Ad'),
              body: body.creative.body ? String(body.creative.body) : undefined,
              imageUrl: body.creative.imageUrl ? String(body.creative.imageUrl) : undefined,
              ctaUrl: body.creative.ctaUrl ? String(body.creative.ctaUrl) : undefined,
            }
          : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.patch(
  '/ads/campaigns/:id/status',
  requirePermission('ads:write'),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const status = String(req.body?.status ?? '') as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
      res.json({ ok: true, data: await setCampaignStatus(String(id), status) });
    } catch (e) {
      next(e);
    }
  },
);

ecommerceDomainRouter.get('/ads/inventory', requirePermission('ads:read'), async (req, res, next) => {
  try {
    const placement = req.query.placement
      ? (String(req.query.placement) as 'BANNER' | 'SPONSORED_FEED' | 'APP_OPEN')
      : undefined;
    res.json({ ok: true, data: await listActiveInventory(placement) });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.get('/ads/invoices', requirePermission('ads:billing'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listInvoices() });
  } catch (e) {
    next(e);
  }
});

ecommerceDomainRouter.post(
  '/ads/invoices',
  requirePermission('ads:billing'),
  async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      res.status(201).json({
        ok: true,
        data: await issueAdInvoice({
          campaignId: String(body.campaignId ?? ''),
          amountThb: String(body.amountThb ?? '0'),
          lineItems: body.lineItems,
          actor: req.adminActor ?? 'admin',
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

ecommerceDomainRouter.post(
  '/ads/invoices/:id/pay',
  requirePermission('ads:billing'),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      res.json({
        ok: true,
        data: await payAdInvoice({
          invoiceId: String(id),
          actor: req.adminActor ?? 'admin',
          idempotencyKey: String(req.body?.idempotencyKey ?? `adpay_${id}`),
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);
