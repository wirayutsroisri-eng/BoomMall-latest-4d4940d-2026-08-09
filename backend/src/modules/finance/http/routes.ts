import { Router } from 'express';
import { requireUserOrDevHeader } from '../../../middleware/userAuth';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import { requireAccountingMasterKey } from '../../../middleware/requireAccountingMasterKey';
import { financeDomainStatus, getTaxSummary, listPendingWithdrawals, rejectWithdrawal } from '../FinanceService';
import { AppError } from '../../../lib/errors';
import { prisma } from '../../../lib/prisma';
import {
  adminApproveWithdrawal,
  autoCompleteDeliveredOrdersCronJob,
  getPlatformRevenue,
  getSellerFinanceDashboard,
  holdEscrowOnPayment,
  requestWithdrawal,
  saveStoreBankAccount,
  setStoreGpPercent,
} from '../services/EscrowService';
import { setStorePaymentPin } from '../services/PaymentPinService';
import { getPlatformSettings, updatePlatformSettings } from '../services/PlatformSettingsService';
import {
  exportSellerStatement,
  parseStatementPeriod,
  buildSellerStatement,
} from '../services/SellerStatementService';
import { authedUserId } from '../../../middleware/userAuth';

export const financeSellerRouter = Router();
export const financeAdminRouter = Router();
export const financeWebhookRouter = Router();
/** Alias ตามสเปก: /api/v1/seller/reports/... */
export const sellerReportsRouter = Router();

financeSellerRouter.use(requireUserOrDevHeader);
sellerReportsRouter.use(requireUserOrDevHeader);

async function handleSellerStatement(req: UserAuthedRequest, res: import('express').Response, next: import('express').NextFunction) {
  try {
    const storeId = authedUserId(req);
    const formatRaw = String(req.query.format ?? 'json').toLowerCase();
    const format = formatRaw === 'pdf' || formatRaw === 'xlsx' || formatRaw === 'excel'
      ? formatRaw === 'excel'
        ? 'xlsx'
        : formatRaw
      : 'json';
    const period = parseStatementPeriod({
      month: req.query.month != null ? String(req.query.month) : undefined,
      year: req.query.year != null ? String(req.query.year) : undefined,
      from: req.query.from != null ? String(req.query.from) : undefined,
      to: req.query.to != null ? String(req.query.to) : undefined,
    });

    if (format === 'json') {
      res.json({ ok: true, data: await buildSellerStatement(storeId, period) });
      return;
    }

    const file = await exportSellerStatement({ storeId, period, format });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  } catch (e) {
    next(e);
  }
}

financeSellerRouter.get('/reports/statement', handleSellerStatement);
sellerReportsRouter.get('/statement', handleSellerStatement);

financeSellerRouter.get('/wallet', async (req: UserAuthedRequest, res, next) => {
  try {
    res.json({ ok: true, data: await getSellerFinanceDashboard(authedUserId(req)) });
  } catch (e) {
    next(e);
  }
});

financeSellerRouter.get('/dashboard', async (req: UserAuthedRequest, res, next) => {
  try {
    res.json({ ok: true, data: await getSellerFinanceDashboard(authedUserId(req)) });
  } catch (e) {
    next(e);
  }
});

financeSellerRouter.post('/bank-account', async (req: UserAuthedRequest, res, next) => {
  try {
    const storeId = authedUserId(req);
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await saveStoreBankAccount(storeId, {
        bankName: String(body.bankName ?? body.bank_name ?? ''),
        bankAccountNo: String(body.bankAccountNo ?? body.bank_account_no ?? ''),
        bankAccountName: String(body.bankAccountName ?? body.bank_account_name ?? ''),
        bankCode: body.bankCode ? String(body.bankCode) : undefined,
        isCorporate: body.isCorporate != null ? Boolean(body.isCorporate) : undefined,
        storeName: body.storeName ? String(body.storeName) : undefined,
        taxId: body.taxId ? String(body.taxId) : undefined,
        address: body.address != null ? String(body.address) : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

/** ตั้งค่า / เปลี่ยน Payment PIN 6 หลัก — ยืนยันรหัสผ่านบัญชีหรือ PIN เดิม */
financeSellerRouter.post('/payment-pin', async (req: UserAuthedRequest, res, next) => {
  try {
    const storeId = authedUserId(req);
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await setStorePaymentPin(storeId, {
        pin: String(body.pin ?? ''),
        password: body.password != null ? String(body.password) : undefined,
        currentPin: body.currentPin != null ? String(body.currentPin) : undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

financeSellerRouter.post('/withdraw', async (req: UserAuthedRequest, res, next) => {
  try {
    const storeId = authedUserId(req);
    const body = req.body ?? {};
    // ห้ามรับ storeId จาก body — ใช้ JWT เท่านั้น
    const amount = Number(body.amount ?? body.amountThb ?? 0);
    const pin = String(body.pin ?? '');
    res.status(201).json({
      ok: true,
      data: await requestWithdrawal(storeId, amount, pin),
    });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.use(requireAccountingMasterKey);

financeAdminRouter.get('/status', (_req, res) => {
  res.json({ ok: true, data: financeDomainStatus() });
});

financeAdminRouter.get('/settings', async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await getPlatformSettings() });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.put('/settings', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await updatePlatformSettings({
        defaultGpPercent: body.defaultGpPercent != null ? Number(body.defaultGpPercent) : undefined,
        autoCompleteDays: body.autoCompleteDays != null ? Number(body.autoCompleteDays) : undefined,
        payoutMode: body.payoutMode != null ? String(body.payoutMode) : undefined,
        autoPayoutMaxLimit:
          body.autoPayoutMaxLimit != null ? Number(body.autoPayoutMaxLimit) : undefined,
        bankName: body.bankName === undefined ? undefined : body.bankName ? String(body.bankName) : null,
        bankAccountNo:
          body.bankAccountNo === undefined ? undefined : body.bankAccountNo ? String(body.bankAccountNo) : null,
        bankAccountName:
          body.bankAccountName === undefined
            ? undefined
            : body.bankAccountName
              ? String(body.bankAccountName)
              : null,
        bankCode: body.bankCode === undefined ? undefined : body.bankCode ? String(body.bankCode) : null,
        actor: req.header('x-actor')?.trim() || 'accounting',
      }),
    });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.put('/stores/:id/gp', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const raw = req.body?.customGpPercent ?? req.body?.gpPercent;
    const custom = raw === null || raw === '' ? null : Number(raw);
    res.json({
      ok: true,
      data: await setStoreGpPercent(String(id), custom, req.body?.name ? String(req.body.name) : undefined),
    });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.get('/revenue', async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await getPlatformRevenue() });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.get('/tax-summary', async (_req, res, next) => {
  try {
    const [tax, revenue] = await Promise.all([getTaxSummary(), getPlatformRevenue()]);
    res.json({ ok: true, data: { ...tax, escrow: revenue } });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.get('/withdrawals', async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listPendingWithdrawals() });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.post('/withdrawals/:id/approve', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const proof = String(req.body?.proofOfTransfer ?? req.body?.proof ?? '');
    const actor = req.header('x-actor')?.trim() || 'accounting';
    res.json({ ok: true, data: await adminApproveWithdrawal(String(id), proof, actor) });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.post('/withdrawals/:id/reject', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const actor = req.header('x-actor')?.trim() || 'accounting';
    res.json({ ok: true, data: await rejectWithdrawal(String(id), actor) });
  } catch (e) {
    next(e);
  }
});

financeAdminRouter.post('/escrow/auto-complete', async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await autoCompleteDeliveredOrdersCronJob() });
  } catch (e) {
    next(e);
  }
});

/** PSP callback — สร้าง escrow ซ้ำได้ถ้าออเดอร์ชำระแล้ว ไม่ทำ PAID เองถ้ายังไม่ผ่าน gateway */
financeWebhookRouter.post('/psp/payment', async (req, res, next) => {
  try {
    const secret = process.env.PSP_WEBHOOK_SECRET?.trim();
    if (secret && req.header('x-webhook-secret') !== secret) {
      throw new AppError('FORBIDDEN', 'invalid webhook secret', 403);
    }
    const orderId = String(req.body?.orderId ?? req.body?.id ?? '');
    const order = await prisma.commerceOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
    if (order.status === 'PENDING_PAYMENT') {
      throw new AppError('VALIDATION', 'order is not captured yet — use POST /commerce/orders/:id/pay', 409);
    }
    if (!order.merchantId) throw new AppError('VALIDATION', 'order has no store', 400);
    const escrow = await holdEscrowOnPayment({
      orderId: order.id,
      storeId: order.merchantId,
      merchandiseThb: order.merchandiseThb,
      shippingFeeThb: order.shippingFeeThb,
    });
    res.json({ ok: true, data: escrow });
  } catch (e) {
    next(e);
  }
});
