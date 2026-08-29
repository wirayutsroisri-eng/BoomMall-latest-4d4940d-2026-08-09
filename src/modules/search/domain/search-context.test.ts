import { describe, expect, it } from 'vitest';
import { normalizeSearchContext, scopeForSearchContext } from './search-context';

describe('search context isolation', () => {
  it('allows all result types only for Feed Open Search', () => {
    expect(scopeForSearchContext('feed_global')).toBe('all');
  });

  it.each([
    ['jobs', 'jobs'],
    ['used_market', 'used_products'],
    ['marketplace', 'products'],
    ['services', 'services'],
  ] as const)('forces %s to its own scope', (context, expectedScope) => {
    expect(scopeForSearchContext(context)).toBe(expectedScope);
  });

  it('keeps legacy route params scoped', () => {
    expect(normalizeSearchContext('secondhand')).toBe('used_market');
    expect(normalizeSearchContext('shop')).toBe('marketplace');
    expect(normalizeSearchContext('unknown')).toBe('feed');
  });
});
