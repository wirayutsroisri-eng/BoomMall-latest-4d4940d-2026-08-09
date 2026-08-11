import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { serializeBigInt } from '../lib/money';
import type { AuthedRequest } from '../middleware/adminAuth';
import { reconcileLedger } from '../services/reconcile';

export async function getLedgerReconcile(_req: AuthedRequest, res: Response) {
  const report = await reconcileLedger(prisma);
  res.status(report.ok ? 200 : 409).json({
    ok: report.ok,
    data: serializeBigInt(report),
  });
}
