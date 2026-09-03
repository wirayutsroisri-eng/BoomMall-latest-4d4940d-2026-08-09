import { describe, expect, it } from 'vitest';
import { normalizePostProductInput } from '../PostProductService';

describe('ปักตะกร้า — pin input', () => {
  it('ignores anything that is not a product reference', () => {
    expect(normalizePostProductInput(undefined)).toEqual([]);
    expect(normalizePostProductInput([null, 'x', { skuId: 'v1' }])).toEqual([]);
  });

  it('keeps the first pin when the same product is sent twice', () => {
    const pins = normalizePostProductInput([
      { productId: 'p1', skuId: 'v1' },
      { productId: 'p1', skuId: 'v2' },
    ]);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.skuId).toBe('v1');
  });

  it('clamps pin coordinates to the media box', () => {
    const [pin] = normalizePostProductInput([{ productId: 'p1', x: 1.8, y: -0.4 }]);
    expect(pin!.x).toBe(1);
    expect(pin!.y).toBe(0);
  });

  it('drops coordinates that are not numbers', () => {
    const [pin] = normalizePostProductInput([{ productId: 'p1', x: 'left', y: null }]);
    expect(pin!.x).toBeNull();
    expect(pin!.y).toBeNull();
  });

  it('caps a post at ten pins', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ productId: `p${i}` }));
    expect(normalizePostProductInput(many)).toHaveLength(10);
  });
});
