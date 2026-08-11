import type { Response, NextFunction } from 'express';
import { TopUpStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { serializeBigInt } from '../lib/money';
import { AppError } from '../lib/errors';
import type { AuthedRequest } from '../middleware/adminAuth';
import {
  approveSellerTopUp,
  createTopUpRequest,
  listTopUps,
} from '../services/topup';

const approveSchema = z.object({
  topUpId: z.string().min(1),
  reviewNote: z.string().optional(),
  /** Fallback if header missing */
  idempotencyKey: z.string().min(8).optional(),
});

export async function postApproveTopUp(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const body = approveSchema.parse(req.body);
    const idempotencyKey =
      req.header('idempotency-key')?.trim() ||
      body.idempotencyKey?.trim() ||
      '';
    if (!idempotencyKey) {
      throw new AppError(
        'IDEMPOTENCY_REQUIRED',
        'Provide Idempotency-Key header (or body.idempotencyKey)',
        400,
      );
    }

    const result = await approveSellerTopUp(prisma, {
      topUpId: body.topUpId,
      idempotencyKey,
      reviewedBy: req.adminActor ?? 'admin',
      reviewNote: body.reviewNote,
    });

    res.status(result.replay ? 200 : 201).json({
      ok: true,
      replay: result.replay,
      data: serializeBigInt(result.response ?? result),
    });
  } catch (e) {
    next(e);
  }
}

export async function getTopUps(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : undefined;
    const status =
      statusRaw && Object.values(TopUpStatus).includes(statusRaw as TopUpStatus)
        ? (statusRaw as TopUpStatus)
        : undefined;
    const rows = await listTopUps(prisma, status);
    res.json({ ok: true, data: serializeBigInt(rows) });
  } catch (e) {
    next(e);
  }
}

const createSchema = z.object({
  sellerOwnerRef: z.string().min(1),
  amountThb: z.number().int().positive(),
  proofUrl: z.string().url(),
  proofNote: z.string().optional(),
  submittedBy: z.string().min(1),
});

export async function postCreateTopUp(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    const row = await createTopUpRequest(prisma, body);
    res.status(201).json({ ok: true, data: serializeBigInt(row) });
  } catch (e) {
    next(e);
  }
}
