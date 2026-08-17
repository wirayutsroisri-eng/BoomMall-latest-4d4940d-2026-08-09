/**
 * Seller Payout Gateway — โอนเงินออกให้ร้าน (แยกจาก capture ฝั่งผู้ซื้อ)
 * ห้ามเคลม TRANSFERRED โดยไม่มี transferRef จาก gateway จริง
 */
import { AppError } from '../../../lib/errors';

export type SellerPayoutInput = {
  withdrawalId: string;
  sellerId: string;
  amountThb: number;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  bankCode?: string | null;
  idempotencyKey: string;
};

export type SellerPayoutResult = {
  ok: true;
  transferRef: string;
  provider: string;
  raw?: Record<string, unknown>;
};

export interface SellerPayoutGateway {
  readonly provider: string;
  readonly configured: boolean;
  transfer(input: SellerPayoutInput): Promise<SellerPayoutResult>;
}

export class UnconfiguredSellerPayoutGateway implements SellerPayoutGateway {
  readonly provider = 'UNCONFIGURED';
  readonly configured = false;

  async transfer(_input: SellerPayoutInput): Promise<SellerPayoutResult> {
    throw new AppError(
      'PAYOUT_NOT_CONFIGURED',
      'ยังไม่ได้ตั้งค่า Payout Gateway — ส่งเข้าคิว Manual ให้แอดมินโอน',
      503,
    );
  }
}

/** Dev only — ต้อง ALLOW_MOCK_PSP=1 */
export class DevMockSellerPayoutGateway implements SellerPayoutGateway {
  readonly provider = 'DEV_MOCK';
  readonly configured = true;

  async transfer(input: SellerPayoutInput): Promise<SellerPayoutResult> {
    if (process.env.ALLOW_MOCK_PSP !== '1') {
      throw new AppError(
        'PAYOUT_MOCK_DISABLED',
        'ALLOW_MOCK_PSP=1 required for mock seller payout',
        403,
      );
    }
    return {
      ok: true,
      transferRef: `mock_payout_${input.idempotencyKey}`,
      provider: this.provider,
      raw: { warning: 'DEV ONLY — not for production / App Review' },
    };
  }
}

/**
 * Omise Transfer stub — เปิดใช้เมื่อมี OMISE_SECRET_KEY + recipient
 * ถ้ายังไม่มี recipient mapping จะ throw เพื่อตก Manual
 */
export class OmiseSellerPayoutGateway implements SellerPayoutGateway {
  readonly provider = 'omise';
  readonly configured = Boolean(process.env.OMISE_SECRET_KEY?.trim());

  async transfer(input: SellerPayoutInput): Promise<SellerPayoutResult> {
    const secret = process.env.OMISE_SECRET_KEY?.trim();
    if (!secret) {
      throw new AppError('PAYOUT_NOT_CONFIGURED', 'OMISE_SECRET_KEY required for auto payout', 503);
    }
    // Omise ต้องมี recipient id ที่ผูกบัญชีร้านแล้ว — ยังไม่มี mapping → ไม่จำลองสำเร็จ
    const recipientId = process.env.OMISE_DEFAULT_RECIPIENT_ID?.trim();
    if (!recipientId) {
      throw new AppError(
        'PAYOUT_RECIPIENT_REQUIRED',
        'ต้องผูก Omise recipient กับบัญชีร้านก่อนโอนออโต้',
        503,
      );
    }
    const amountSatang = Math.round(input.amountThb * 100);
    const res = await fetch('https://api.omise.co/transfers', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Omise-Version': '2019-05-29',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: new URLSearchParams({
        amount: String(amountSatang),
        recipient: recipientId,
        'metadata[withdrawalId]': input.withdrawalId,
        'metadata[sellerId]': input.sellerId,
        'metadata[bankAccountNo]': input.bankAccountNo,
      }),
    });
    const raw = (await res.json()) as Record<string, unknown>;
    if (!res.ok || raw.object === 'error') {
      throw new AppError('PAYOUT_FAILED', String(raw.message ?? 'Omise transfer failed'), 502);
    }
    return {
      ok: true,
      transferRef: String(raw.id ?? input.idempotencyKey),
      provider: this.provider,
      raw,
    };
  }
}

let payoutGateway: SellerPayoutGateway = new UnconfiguredSellerPayoutGateway();

export function setSellerPayoutGateway(g: SellerPayoutGateway) {
  payoutGateway = g;
}

export function getSellerPayoutGateway(): SellerPayoutGateway {
  return payoutGateway;
}

export function bootstrapSellerPayoutFromEnv() {
  const provider = (process.env.PAYOUT_PROVIDER ?? process.env.PSP_PROVIDER ?? '').toLowerCase();
  if (provider === 'mock_dev') {
    setSellerPayoutGateway(new DevMockSellerPayoutGateway());
  } else if (provider === 'omise') {
    setSellerPayoutGateway(new OmiseSellerPayoutGateway());
  } else {
    setSellerPayoutGateway(new UnconfiguredSellerPayoutGateway());
  }
}

export type PayoutRouteDecision =
  | { route: 'AUTO' }
  | { route: 'MANUAL'; reason: string };

export function decidePayoutRoute(input: {
  payoutMode: string;
  amountSatang: number;
  autoPayoutMaxLimitSatang: number;
  bankCoolingRemainingMs: number;
  gatewayConfigured: boolean;
}): PayoutRouteDecision {
  if (String(input.payoutMode).toUpperCase() !== 'AUTO') {
    return { route: 'MANUAL', reason: 'mode_manual' };
  }
  if (input.bankCoolingRemainingMs > 0) {
    return { route: 'MANUAL', reason: 'risk_bank_cooling' };
  }
  if (input.amountSatang > input.autoPayoutMaxLimitSatang) {
    return { route: 'MANUAL', reason: 'over_limit' };
  }
  if (!input.gatewayConfigured) {
    return { route: 'MANUAL', reason: 'gateway_unconfigured' };
  }
  return { route: 'AUTO' };
}
