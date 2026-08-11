import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import { getLedgerReconcile } from '../controllers/ledgerController';

export const ledgerRouter = Router();

/** GET /api/v1/ledger/reconcile */
ledgerRouter.get('/reconcile', requireAdmin, getLedgerReconcile);
