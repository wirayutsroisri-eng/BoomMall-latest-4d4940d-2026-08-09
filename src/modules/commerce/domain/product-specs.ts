import type { CustomFieldDef, CustomFieldValue, SkuVariant } from './types';

export type SpecDraft = {
  id: string;
  label: string;
  value: string;
};

const KNOWN_LABELS: Record<string, string> = {
  voltage: 'แรงดัน',
  capacityAh: 'ความจุ (Ah)',
  warrantyMonths: 'รับประกัน',
  material: 'วัสดุ',
  wattage: 'กำลัง (W)',
  size: 'ขนาด',
  color: 'สี',
};

export function newSpecDraft(seed?: Partial<SpecDraft>): SpecDraft {
  return {
    id: seed?.id ?? `sp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: seed?.label ?? '',
    value: seed?.value ?? '',
  };
}

/** Empty starter rows — capacity (Ah) only for batteries, never controllers. */
export function suggestedSpecsForCategory(categoryKey?: string): SpecDraft[] {
  switch (categoryKey) {
    case 'battery':
      return [
        newSpecDraft({ label: 'แรงดัน' }),
        newSpecDraft({ label: 'ความจุ (Ah)' }),
        newSpecDraft({ label: 'รับประกัน' }),
      ];
    case 'controller':
      return [
        newSpecDraft({ label: 'แรงดัน' }),
        newSpecDraft({ label: 'กระแส (A)' }),
        newSpecDraft({ label: 'รับประกัน' }),
      ];
    case 'motor':
      return [
        newSpecDraft({ label: 'แรงดัน' }),
        newSpecDraft({ label: 'กำลัง (W)' }),
        newSpecDraft({ label: 'ขนาด' }),
      ];
    default:
      return [newSpecDraft({ label: 'แรงดัน' }), newSpecDraft({ label: 'รับประกัน' })];
  }
}

export function specsFromCustomFields(
  fields: CustomFieldValue[] | undefined,
  defs?: CustomFieldDef[],
): SpecDraft[] {
  if (!fields?.length) return [];
  return fields
    .filter((f) => String(f.value ?? '').trim() !== '' || (f.label ?? '').trim() !== '')
    .map((f) =>
      newSpecDraft({
        id: f.key,
        label: f.label?.trim() || defs?.find((d) => d.key === f.key)?.label || KNOWN_LABELS[f.key] || f.key,
        value: String(f.value ?? ''),
      }),
    );
}

export function customFieldsFromSpecs(rows: SpecDraft[]): CustomFieldValue[] {
  return rows
    .map((row) => ({
      key: row.id,
      label: row.label.trim(),
      value: row.value.trim(),
    }))
    .filter((row) => row.label || row.value);
}

export function specsFromVariantAttrs(attrs?: SkuVariant['attrs']): SpecDraft[] {
  if (attrs?.specs?.length) {
    return attrs.specs.map((row) => newSpecDraft({ label: row.label, value: row.value }));
  }
  const rows: SpecDraft[] = [];
  if (attrs?.voltage) rows.push(newSpecDraft({ label: 'แรงดัน', value: attrs.voltage }));
  if (attrs?.capacityAh != null && attrs.capacityAh !== 0) {
    rows.push(newSpecDraft({ label: 'ความจุ (Ah)', value: String(attrs.capacityAh) }));
  }
  if (attrs?.size) rows.push(newSpecDraft({ label: 'ขนาด', value: attrs.size }));
  if (attrs?.color) rows.push(newSpecDraft({ label: 'สี', value: attrs.color }));
  return rows;
}

export function attrsWithSpecs(
  attrs: SkuVariant['attrs'] | undefined,
  rows: SpecDraft[],
): SkuVariant['attrs'] {
  const specs = rows
    .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter((row) => row.label || row.value);
  return {
    ...(attrs ?? {}),
    specs: specs.length ? specs : undefined,
  };
}

export function variantDetailAttrs(
  attrs: SkuVariant['attrs'] | undefined,
  detail: { size?: string; weight?: string; note?: string },
): SkuVariant['attrs'] {
  const next: SkuVariant['attrs'] = { ...(attrs ?? {}) };
  delete next.specs;
  next.size = detail.size?.trim() || undefined;
  next.weight = detail.weight?.trim() || undefined;
  next.note = detail.note?.trim() || undefined;
  return next;
}

export function variantDetailsFromAttrs(attrs?: SkuVariant['attrs']) {
  const specSize = attrs?.specs?.find((s) => /ขนาด|size/i.test(s.label))?.value;
  const specWeight = attrs?.specs?.find((s) => /น้ำหนัก|weight|กก|kg/i.test(s.label))?.value;
  return {
    size: attrs?.size ?? specSize ?? '',
    weight: attrs?.weight ?? specWeight ?? '',
    note: attrs?.note ?? '',
  };
}
