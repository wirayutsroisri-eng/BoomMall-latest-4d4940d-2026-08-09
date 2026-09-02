/**
 * Order money math — one place, satang only.
 *
 * The platform fee (GP) is a service the company sells, so VAT belongs on the fee
 * and — for corporate sellers — withholding tax is deducted from that same fee.
 * Both rates default to 0: switching them on is an accounting decision made in
 * platform settings, never a side effect of a deploy.
 */

export function toSatang(thb: number) {
  return Math.max(0, Math.round(Number(thb) * 100));
}

export function toThb(satang: number) {
  return Math.round(satang) / 100;
}

/** รับ 5 (=5%) หรือ 0.05 */
export function normalizeGpPercent(rate: number, fallback = 5) {
  if (!Number.isFinite(rate) || rate < 0) return fallback;
  if (rate > 0 && rate <= 1) return rate * 100;
  return Math.min(100, rate);
}

function percentToBps(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(10_000, Math.round(percent * 100));
}

export type EscrowQuote = {
  gpPercent: number;
  vatPercent: number;
  whtPercent: number;
  satang: {
    gross: number;
    shipping: number;
    gpAmount: number;
    vatAmount: number;
    whtAmount: number;
    /** เงินที่แพลตฟอร์มได้รับจริง = GP + VAT − หัก ณ ที่จ่าย */
    platformTake: number;
    netMerchantAmount: number;
  };
  thb: {
    gross: number;
    shipping: number;
    gpAmount: number;
    vatAmount: number;
    whtAmount: number;
    platformTake: number;
    netMerchantAmount: number;
  };
};

export function quoteEscrow(input: {
  merchandiseThb: number;
  shippingFeeThb?: number;
  gpPercent: number;
  /** VAT บนค่า GP — 0 = ปิด */
  vatPercent?: number;
  /** หัก ณ ที่จ่ายบนค่า GP (ร้านนิติบุคคลเท่านั้น) — 0 = ปิด */
  whtPercent?: number;
}): EscrowQuote {
  const gpPercent = normalizeGpPercent(input.gpPercent);
  const vatPercent = Math.max(0, Number(input.vatPercent ?? 0));
  const whtPercent = Math.max(0, Number(input.whtPercent ?? 0));

  const gross = toSatang(input.merchandiseThb);
  const shipping = toSatang(input.shippingFeeThb ?? 0);

  // GP คิดจากค่าสินค้าเท่านั้น ไม่คิดจากค่าส่ง — ค่าส่งส่งต่อให้ร้านเต็มจำนวน
  const gpAmount = Math.floor((gross * percentToBps(gpPercent)) / 10_000);
  const vatAmount = Math.floor((gpAmount * percentToBps(vatPercent)) / 10_000);
  // ร้านนิติบุคคลหักภาษี ณ ที่จ่ายจากค่าบริการ แล้วเก็บไว้นำส่งสรรพากรเอง
  const whtAmount = Math.floor((gpAmount * percentToBps(whtPercent)) / 10_000);

  const platformTake = Math.max(0, gpAmount + vatAmount - whtAmount);
  const netMerchantAmount = Math.max(0, gross + shipping - platformTake);

  return {
    gpPercent,
    vatPercent,
    whtPercent,
    satang: { gross, shipping, gpAmount, vatAmount, whtAmount, platformTake, netMerchantAmount },
    thb: {
      gross: toThb(gross),
      shipping: toThb(shipping),
      gpAmount: toThb(gpAmount),
      vatAmount: toThb(vatAmount),
      whtAmount: toThb(whtAmount),
      platformTake: toThb(platformTake),
      netMerchantAmount: toThb(netMerchantAmount),
    },
  };
}
