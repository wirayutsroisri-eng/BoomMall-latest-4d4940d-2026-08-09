export type SearchContext =
  | 'feed_global'
  | 'nearby'
  | 'jobs'
  | 'used_market'
  | 'marketplace'
  | 'services'
  | 'feed'
  | 'clips';

export type SearchScope = 'all' | 'nearby' | 'jobs' | 'used_products' | 'products' | 'services' | 'posts' | 'videos';

const CONTEXT_SCOPE: Record<SearchContext, SearchScope> = {
  feed_global: 'all', nearby: 'nearby', jobs: 'jobs', used_market: 'used_products',
  marketplace: 'products', services: 'services', feed: 'posts', clips: 'videos',
};

export function normalizeSearchContext(value: string): SearchContext {
  if (value === 'secondhand') return 'used_market';
  if (value === 'shop') return 'marketplace';
  return value in CONTEXT_SCOPE ? value as SearchContext : 'feed';
}

export function scopeForSearchContext(context: SearchContext): SearchScope {
  return CONTEXT_SCOPE[context];
}
