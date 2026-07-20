/** ตรรกะราคาส่ง — ดัดจาก BoomMall Alpha v39 (ใช้บาท/ชิ้น) */

export type WholesalePriceTier = { minQty: number; pricePerUnit: number };

export const MAX_WHOLESALE_PRICE_TIERS = 5;
export const MAX_WHOLESALE_QUANTITY = 100_000;
export const MIN_UNIT_PRICE = 1;
export const MAX_UNIT_PRICE = 10_000_000;

export class WholesalePriceTierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WholesalePriceTierError";
  }
}

export function normalizeWholesalePriceTiers(
  basePrice: number,
  input: unknown
): WholesalePriceTier[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new WholesalePriceTierError("รูปแบบราคาส่งไม่ถูกต้อง");
  if (input.length > MAX_WHOLESALE_PRICE_TIERS) {
    throw new WholesalePriceTierError(`เพิ่มราคาส่งได้สูงสุด ${MAX_WHOLESALE_PRICE_TIERS} ขั้น`);
  }

  const tiers = input.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new WholesalePriceTierError("รูปแบบราคาส่งไม่ถูกต้อง");
    }
    const { minQty, pricePerUnit } = candidate as Record<string, unknown>;
    if (typeof minQty !== "number" || !Number.isInteger(minQty) || minQty < 2 || minQty > MAX_WHOLESALE_QUANTITY) {
      throw new WholesalePriceTierError("จำนวนขั้นต่ำของราคาส่งต้องอยู่ระหว่าง 2–100,000 ชิ้น");
    }
    if (
      typeof pricePerUnit !== "number" ||
      !Number.isFinite(pricePerUnit) ||
      pricePerUnit < MIN_UNIT_PRICE ||
      pricePerUnit > MAX_UNIT_PRICE
    ) {
      throw new WholesalePriceTierError("ราคาส่งต้องอยู่ระหว่าง 1 ถึง 10,000,000 บาทต่อชิ้น");
    }
    return { minQty, pricePerUnit: Math.round(pricePerUnit * 100) / 100 };
  }).sort((a, b) => a.minQty - b.minQty);

  if (new Set(tiers.map((t) => t.minQty)).size !== tiers.length) {
    throw new WholesalePriceTierError("จำนวนขั้นต่ำของแต่ละขั้นราคาต้องไม่ซ้ำกัน");
  }

  let previousPrice = basePrice;
  for (const tier of tiers) {
    if (tier.pricePerUnit > previousPrice) {
      throw new WholesalePriceTierError("ราคาต่อชิ้นของจำนวนที่มากขึ้นต้องไม่สูงกว่าขั้นก่อนหน้า");
    }
    previousPrice = tier.pricePerUnit;
  }
  return tiers;
}

/** ราคาต่อชิ้นตามจำนวนที่สั่ง */
export function priceTierForQuantity(
  basePrice: number,
  tiers: WholesalePriceTier[],
  quantity: number
): WholesalePriceTier {
  const qty = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1;
  return [...tiers]
    .sort((a, b) => a.minQty - b.minQty)
    .reduce(
      (selected, tier) => (qty >= tier.minQty ? tier : selected),
      { minQty: 1, pricePerUnit: basePrice }
    );
}

/** ขั้นราคาส่งที่ดีที่สุด (minQty สูงสุดที่ยังเข้าถึงได้ด้วย qty 1 = ขั้นแรก) */
export function bestWholesaleTier(tiers: WholesalePriceTier[]): WholesalePriceTier | null {
  if (!tiers.length) return null;
  return [...tiers].sort((a, b) => a.minQty - b.minQty)[0] ?? null;
}

export function hasWholesaleTiers(tiers: unknown): boolean {
  return Array.isArray(tiers) && tiers.length > 0;
}
