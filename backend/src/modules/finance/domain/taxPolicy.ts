/**
 * When tax actually applies.
 *
 * The company is not VAT-registered yet (personal account), so VAT stays off.
 * Everything needed to switch it on later lives in platform settings — no code
 * change, and no retroactive charge on orders that were paid before the
 * registration date.
 */

export type TaxSettings = {
  vatRegistered: boolean;
  vatPercent: number;
  vatEffectiveFrom: Date | string | null;
  whtPercent: number;
};

export type EffectiveTaxRates = {
  vatPercent: number;
  whtPercent: number;
  /** อธิบายว่าทำไมอัตราออกมาเป็นแบบนี้ — ใช้ตอบหน้าแอดมินและตอนตรวจบัญชี */
  reason: 'not_registered' | 'not_yet_effective' | 'zero_rate' | 'active';
};

/**
 * @param at เวลาที่เก็บเงิน — VAT ผูกกับวันที่จ่ายจริง ไม่ใช่เวลาที่รันโค้ด
 */
export function effectiveTaxRates(
  settings: TaxSettings,
  options?: { at?: Date; sellerIsCorporate?: boolean },
): EffectiveTaxRates {
  const at = options?.at ?? new Date();
  const wht = options?.sellerIsCorporate ? Math.max(0, Number(settings.whtPercent) || 0) : 0;

  if (!settings.vatRegistered) {
    return { vatPercent: 0, whtPercent: wht, reason: 'not_registered' };
  }

  const from = settings.vatEffectiveFrom ? new Date(settings.vatEffectiveFrom) : null;
  if (from && !Number.isNaN(from.getTime()) && at < from) {
    return { vatPercent: 0, whtPercent: wht, reason: 'not_yet_effective' };
  }

  const vat = Math.max(0, Number(settings.vatPercent) || 0);
  if (vat <= 0) return { vatPercent: 0, whtPercent: wht, reason: 'zero_rate' };

  return { vatPercent: vat, whtPercent: wht, reason: 'active' };
}

/** เลขผู้เสียภาษีไทย 13 หลัก — ใช้ทั้งบุคคลธรรมดาและนิติบุคคล */
export function isValidThaiTaxId(value: string | null | undefined): boolean {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 13;
}
