import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

/**
 * ล็อก endpoint ฝั่งบัญชีด้วย Header `x-master-key`
 * คีย์อ่านจาก ACCOUNTING_MASTER_KEY หรือ MASTER_KEY ใน env (ไม่ฝังซีเคร็ทในซอร์ส)
 */
export function requireAccountingMasterKey(req: Request, _res: Response, next: NextFunction) {
  const expected =
    process.env.ACCOUNTING_MASTER_KEY?.trim() || process.env.MASTER_KEY?.trim() || '';
  const got = req.header('x-master-key')?.trim() ?? '';
  if (!expected || !got || got !== expected) {
    next(new AppError('FORBIDDEN', 'Missing or invalid x-master-key', 403));
    return;
  }
  next();
}
