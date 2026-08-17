import { describe, expect, it } from 'vitest';
import { parseInventoryCsv } from '../domain/inventory-csv';

describe('parseInventoryCsv', () => {
  it('groups rows with the same title into variants', () => {
    const csv = [
      'title,variant,price,stock,category',
      'Hub Motor,12 นิ้ว 3000W,8500,5,มอเตอร์',
      'Hub Motor,14 นิ้ว 3000W,9200,3,มอเตอร์',
    ].join('\n');
    const result = parseInventoryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.variants).toHaveLength(2);
    expect(result.products[0]?.variants[0]?.label).toBe('12 นิ้ว 3000W');
    expect(result.products[0]?.variants[1]?.stock).toBe(3);
  });

  it('accepts Thai headers and quoted commas', () => {
    const csv = 'ชื่อสินค้า,ราคา,สต็อก\n"แบต 60V, Smart BMS",12900,4\n';
    const result = parseInventoryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products[0]?.title).toBe('แบต 60V, Smart BMS');
    expect(result.products[0]?.variants[0]?.price).toBe(12900);
  });

  it('rejects xlsx zip bytes with a CSV hint', () => {
    const result = parseInventoryCsv('PK\u0003\u0004fake-xlsx');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/CSV/);
  });
});
