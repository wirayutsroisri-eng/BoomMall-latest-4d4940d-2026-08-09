import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { serializeBigInt } from '../lib/money';
import type { AuthedRequest } from '../middleware/adminAuth';
import { getDashboardStats } from '../services/dashboard';

export async function getAdminDashboardStats(_req: AuthedRequest, res: Response) {
  const stats = await getDashboardStats(prisma);
  res.json({ ok: true, data: serializeBigInt(stats) });
}
