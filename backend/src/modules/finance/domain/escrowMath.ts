/** คำนวณ GP แบบเปอร์เซ็นต์ตามสเปก: gp = gross * (rate / 100) */

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

export function quoteEscrow(input: {
  merchandiseThb: number;
  shippingFeeThb?: number;
  gpPercent: number;
}) {
  const gpPercent = normalizeGpPercent(input.gpPercent);
  const gross = toSatang(input.merchandiseThb);
  const shipping = toSatang(input.shippingFeeThb ?? 0);
  // gpAmount = grossAmount * (gpRate / 100) — ปัดลงเป็นสตางค์
  const gpAmount = Math.floor((gross * Math.round(gpPercent * 100)) / 10_000);
  const netMerchantAmount = Math.max(0, gross - gpAmount + shipping);
  return {
    gpPercent,
    satang: { gross, shipping, gpAmount, netMerchantAmount },
    thb: {
      gross: toThb(gross),
      shipping: toThb(shipping),
      gpAmount: toThb(gpAmount),
      netMerchantAmount: toThb(netMerchantAmount),
    },
  };
}
