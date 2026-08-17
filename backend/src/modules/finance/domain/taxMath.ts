/**
 * สูตรภาษีขายของ BoomMall
 *
 * แพลตฟอร์มรับรู้รายได้เฉพาะค่า GP (ไม่รวมยอดขายสินค้าของร้าน)
 * ค่า GP ที่หักจากร้านเป็นยอดรวม VAT 7% (VAT-inclusive)
 *
 *   GP ก่อน VAT (ฐานภาษี) = GP / 1.07
 *   ภาษีขาย (Output VAT)  = GP − GP ก่อน VAT
 *
 * ใช้หน่วยสตางค์ทั้งสมุด เพื่อไม่ให้ทศนิยมลอยตัว และให้ฐาน + VAT = GP พอดี
 */

export const OUTPUT_VAT_RATE = 0.07;
export const OUTPUT_VAT_DIVISOR = 107;

export type GpVatSplit = {
  /** GP รวม VAT ที่หักจากร้าน (บาท) */
  gpInclusive: number;
  /** ฐานภาษี = GP / 1.07 (บาท) */
  taxBase: number;
  /** Output VAT 7% (บาท) */
  outputVat: number;
  satang: {
    gpInclusive: number;
    taxBase: number;
    outputVat: number;
  };
};

export function toSatang(thb: number) {
  return Math.max(0, Math.round(Number(thb) * 100));
}

export function toThb(satang: number) {
  return Math.round(satang) / 100;
}

/**
 * แยก VAT 7% ออกจากค่า GP แบบ inclusive
 * ปัดฐานเป็นสตางค์ด้วย (gp * 100) / 107 แล้ว VAT = ส่วนต่าง เพื่อไม่ให้คลาดเคลื่อน 1 สตางค์
 */
export function splitGpVatInclusive(gpInclusiveThb: number): GpVatSplit {
  const gpInclusive = toSatang(gpInclusiveThb);
  const taxBase = Math.round((gpInclusive * 100) / OUTPUT_VAT_DIVISOR);
  const outputVat = gpInclusive - taxBase;
  return {
    gpInclusive: toThb(gpInclusive),
    taxBase: toThb(taxBase),
    outputVat: toThb(outputVat),
    satang: { gpInclusive, taxBase, outputVat },
  };
}

/** รวมแถว GP หลายรายการแล้วแยก VAT จากยอดรวม (ใช้กล่องสรุป) */
export function splitGpVatInclusiveSum(gpInclusiveThbList: number[]): GpVatSplit {
  const total = gpInclusiveThbList.reduce((sum, n) => sum + toSatang(n), 0);
  return splitGpVatInclusive(toThb(total));
}

export function isRefundOrCancelStatus(status: string | null | undefined) {
  const s = String(status ?? '').toUpperCase();
  return s === 'REFUNDED' || s === 'CANCELLED' || s === 'CANCELED';
}

/** เลขที่อ้างอิงใบเสร็จภายใน — ยังไม่ใช่ใบกำกับภาษีกรมสรรพากรจนกว่าจะออกจริง */
export function receiptRef(orderId: string, paidAt: Date | null) {
  const ymd = (paidAt ?? new Date()).toISOString().slice(0, 10).replace(/-/g, '');
  const tail = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  return `BM-GP-${ymd}-${tail}`;
}
