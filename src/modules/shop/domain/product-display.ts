import { masterContentImage } from '@/modules/commerce/data/catalog';
import { channelToCondition, conditionLabel } from '@/modules/commerce/domain/product-condition';
import { resolveProductMedia } from '@/modules/commerce/domain/product-media';
import type { CustomFieldDef, MasterSku, SkuVariant } from '@/modules/commerce/domain/types';
import type { ProductCard } from '@/modules/chat/domain/types';

export type GallerySlide = {
  key: string;
  uri: string;
  type: 'image' | 'video';
  variantId?: string;
  /** First-frame poster for videos (extracted at pick time) — lets the PDP
   *  thumbnail strip render instantly without mounting a video player. */
  thumbnailUri?: string;
};


export function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

export function shopKeyOf(master: MasterSku) {
  return master.ownerShopId?.trim() || master.shopName.trim() || 'shop';
}

export function shopHandleOf(master: MasterSku) {
  return (master.ownerShopId ?? `shop-${master.shopName}`).trim() || 'shop';
}

export function hashSeed(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function ratingOf(seed: string) {
  return (4.5 + (hashSeed(seed) % 5) * 0.1).toFixed(1);
}

export function shopAvatarUri(shopKey: string) {
  return `https://i.pravatar.cc/150?u=boommall-shop-${encodeURIComponent(shopKey)}`;
}

export function conditionBadge(master: MasterSku) {
  return conditionLabel(channelToCondition(master.channel));
}

export function priceRangeLabel(master: MasterSku, variants: SkuVariant[]) {
  if (!variants.length) return formatTHB(master.basePrice);
  const prices = variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return formatTHB(min);
  return `${formatTHB(min)} - ${formatTHB(max)}`;
}

export function buildGallery(master: MasterSku, variants: SkuVariant[]): GallerySlide[] {
  const slides: GallerySlide[] = [];
  const seen = new Set<string>();

  const push = (
    uri: string | undefined,
    key: string,
    type: GallerySlide['type'] = 'image',
    variantId?: string,
    thumbnailUri?: string,
  ) => {
    const value = uri?.trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    slides.push({ key, uri: value, type, variantId, thumbnailUri });
  };

  for (const item of resolveProductMedia(master)) {
    push(item.uri, `master-${slides.length}`, item.type, undefined, item.thumbnailUri);
  }


  for (const v of variants) {
    push(v.imageUri, `var-${v.id}`, 'image', v.id);
  }

  if (!slides.length) {
    slides.push({ key: 'fallback', uri: masterContentImage(master.id), type: 'image' });
  }
  return slides;
}

export function slideIndexForVariant(slides: GallerySlide[], variant: SkuVariant | null) {
  if (!variant) return 0;
  const byId = slides.findIndex((s) => s.variantId === variant.id);
  if (byId >= 0) return byId;
  if (variant.imageUri) {
    const byUri = slides.findIndex((s) => s.uri === variant.imageUri);
    if (byUri >= 0) return byUri;
  }
  return 0;
}

const ATTR_LABELS: Record<string, string> = {
  voltage: 'แรงดัน (V)',
  wattage: 'กำลังไฟ (W)',
  capacityAh: 'ความจุ (Ah)',
  size: 'ขนาด',
  color: 'สี',
  warrantyMonths: 'รับประกัน (เดือน)',
  material: 'วัสดุ',
};

export type SpecRow = { key: string; label: string; value: string };

export function specRowsFor(
  master: MasterSku,
  variant: SkuVariant | null,
  fieldDefs: CustomFieldDef[],
): SpecRow[] {
  const rows: SpecRow[] = [];
  const seen = new Set<string>();

  const add = (key: string, label: string, raw: string | number | undefined) => {
    if (raw == null || raw === '') return;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ key, label, value: String(raw) });
  };

  add('brand', 'แบรนด์', master.brand);
  add('sku', 'SKU', variant?.sku ?? master.masterSku);

  if (variant) {
    add('size', ATTR_LABELS.size, variant.attrs.size);
    add('weight', 'น้ำหนัก', variant.attrs.weight);
    add('opt-note', 'รายละเอียดตัวเลือก', variant.attrs.note);
    if (variant.attrs.specs?.length) {
      for (const spec of variant.attrs.specs) {
        add(`opt-${spec.label}`, spec.label || 'สเปก', spec.value);
      }
    } else {
      add('voltage', ATTR_LABELS.voltage, variant.attrs.voltage);
      add('color', ATTR_LABELS.color, variant.attrs.color);
      add('capacityAh', ATTR_LABELS.capacityAh, variant.attrs.capacityAh);
    }
  }

  for (const field of master.customFields) {
    const def = fieldDefs.find((d) => d.key === field.key);
    const label = field.label?.trim() || def?.label || ATTR_LABELS[field.key] || field.key;
    add(field.key, label, field.value);
  }

  return rows;
}

export function relatedRank(seed: string, otherId: string) {
  return hashSeed(`${seed}:${otherId}`);
}

export function masonryThumbHeight(id: string) {
  return 118 + (hashSeed(id) % 72);
}

export function promoShareProduct(input: { title: string; price: string; shopName: string }) {
  return `🔥 ${input.title}\n${input.price}\nร้าน ${input.shopName}\nสั่งบน BoomMall`;
}

export function promoShareShop(shopName: string) {
  return `ร้าน ${shopName} บน BoomMall — อะไหล่รถไฟฟ้า / มอเตอร์ไซค์`;
}

export function variantImageUri(master: MasterSku, variant: SkuVariant | null) {
  return variant?.imageUri?.trim() || master.imageUri || masterContentImage(master.id);
}

/** Taobao-style product card payload attached when chatting a shop from PDP / feed. */
export function chatProductCardOf(master: MasterSku, variant: SkuVariant): ProductCard {
  const soldCount = 200 + (hashSeed(master.id) % 1800);
  return {
    id: master.id,
    variantId: variant.id,
    title: master.title,
    sku: variant.sku,
    price: variant.price,
    currency: 'THB',
    imageUri: variantImageUri(master, variant),
    shopName: master.shopName,
    shopId: master.ownerShopId,
    soldCount,
    shippingHint: 'ส่งด่วน · คาดส่งภายใน 5 ชม.',
    returnHint: 'คืนได้ใน 7 วัน · คืนเงินเร็ว',
  };
}

const DIM_UNIT = '(?:cm|mm|m|นิ้ว|inch|in|")';
const DIM_NUM = '(\\d+(?:[.,]\\d+)?)';
const DIM_SEP = '\\s*[x×*]\\s*';
const DIM_TRIPLE = new RegExp(
  `${DIM_NUM}\\s*(${DIM_UNIT})?${DIM_SEP}${DIM_NUM}\\s*(${DIM_UNIT})?${DIM_SEP}${DIM_NUM}\\s*(${DIM_UNIT})?`,
  'i',
);

export type ParsedDimensions = {
  width: string;
  depth: string;
  height: string;
  caption: string;
};

function withUnit(value: string, unit: string) {
  const n = value.replace(',', '.');
  return unit ? `${n}${unit}` : n;
}

/** Parse W×D×H from seller size text, e.g. "50.2cm x 33cm x 30.2cm". */
export function parseDimensions(raw?: string | null): ParsedDimensions | null {
  const text = raw?.trim();
  if (!text) return null;
  const match = DIM_TRIPLE.exec(text);
  if (!match) return null;
  const fallback = match[6] || match[4] || match[2] || 'cm';
  const width = withUnit(match[1], match[2] || fallback);
  const depth = withUnit(match[3], match[4] || fallback);
  const height = withUnit(match[5], match[6] || fallback);
  return {
    width,
    depth,
    height,
    caption: `${width} × ${depth} × ${height}`,
  };
}

export function variantSpecParts(variant: SkuVariant) {
  const parts: string[] = [];
  const push = (value?: string | number) => {
    const text = value == null ? '' : String(value).trim();
    if (!text) return;
    const lower = text.toLowerCase();
    if (parts.some((p) => p.toLowerCase() === lower || p.toLowerCase().includes(lower))) return;
    const idx = parts.findIndex((p) => lower.includes(p.toLowerCase()));
    if (idx >= 0) {
      parts[idx] = text;
      return;
    }
    parts.push(text);
  };

  const note = variant.attrs.note?.trim().replace(/^สเปก\s*/i, '');
  if (note) {
    push(note);
    return parts;
  }

  push(variant.attrs.voltage);
  if (variant.attrs.capacityAh) push(`${variant.attrs.capacityAh}Ah`);
  for (const spec of variant.attrs.specs ?? []) {
    const chunk = [spec.label, spec.value].filter((s) => s?.trim()).join(' ').trim();
    push(chunk || spec.value);
  }
  return parts;
}

export function variantSpecBracket(variant: SkuVariant) {
  const parts = variantSpecParts(variant);
  if (!parts.length) return '';
  return `【สเปก ${parts.join(' ')}】`;
}

export function variantDimensionCaption(variant: SkuVariant) {
  const parsed = parseDimensions(variant.attrs.size);
  if (parsed) return parsed.caption;
  return variant.attrs.size?.trim() || variant.attrs.weight?.trim() || '';
}

export function variantCardTitle(variant: SkuVariant) {
  const bracket = variantSpecBracket(variant);
  const label = variant.label.trim();
  if (!bracket) return label;
  if (label.includes(bracket) || /สเปก/i.test(label)) return label;
  return `${label} ${bracket}`;
}

export function variantListLabel(variant: SkuVariant) {
  const parsed = parseDimensions(variant.attrs.size);
  if (parsed) {
    const strip = (value: string) => value.replace(/(cm|mm|m)$/i, '');
    return `${variant.label} 【${strip(parsed.width)}*${strip(parsed.depth)}*${strip(parsed.height)}cm】`;
  }
  const dim = variantDimensionCaption(variant);
  return dim ? `${variant.label} 【${dim}】` : variant.label;
}

export function selectedSpecTitle(variant: SkuVariant) {
  return `เลือกแล้ว: "${variantListLabel(variant)}"`;
}

export function selectedSpecSummary(variants: SkuVariant[]) {
  if (!variants.length) return 'เลือกแล้ว: —';
  return `เลือกแล้ว: "${variants.map(variantListLabel).join('; ')}"`;
}

export type HeroOverlay = {
  width?: string;
  depth?: string;
  height?: string;
  caption: string;
};

export function overlayForVariant(variant: SkuVariant | null): HeroOverlay | null {
  if (!variant) return null;
  const parsed = parseDimensions(variant.attrs.size);
  const caption = variantDimensionCaption(variant) || variantSpecBracket(variant).replace(/[【】]/g, '');
  if (!parsed && !caption) return null;
  return {
    width: parsed?.width,
    depth: parsed?.depth,
    height: parsed?.height,
    caption: parsed?.caption || caption,
  };
}

export function overlayForSlide(
  slide: GallerySlide,
  variants: SkuVariant[],
  fallback: SkuVariant | null,
) {
  const fromSlide = slide.variantId ? variants.find((v) => v.id === slide.variantId) : null;
  return overlayForVariant(fromSlide ?? fallback);
}

/** Map a feed pin to a listed shop product. Mock feed SKUs that were never listed return null. */
export function resolveShopMaster(
  product: { id: string; name?: string; shopName?: string } | null | undefined,
  masters: MasterSku[],
): MasterSku | null {
  if (!product) return null;
  const byId = masters.find((m) => m.id === product.id);
  if (byId) return byId;
  const name = product.name?.trim().toLowerCase();
  if (!name) return null;
  const shop = product.shopName?.trim().toLowerCase();
  if (shop) {
    const both = masters.find(
      (m) => m.title.trim().toLowerCase() === name && m.shopName.trim().toLowerCase() === shop,
    );
    if (both) return both;
  }
  return masters.find((m) => m.title.trim().toLowerCase() === name) ?? null;
}
