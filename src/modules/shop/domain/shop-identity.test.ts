import { describe, expect, it } from 'vitest';
import { buildShopIdentity, normalizeShopKey } from './shop-identity';

const shop = {
  id: 'shop-alice-uuid',
  slug: 'alice_shop',
  displayName: 'Alice Shop',
  avatarUrl: 'https://cdn.boommall.app/avatar.jpg',
};

describe('normalizeShopKey', () => {
  it('strips @, whitespace and lowercases', () => {
    expect(normalizeShopKey('  @BoomEV_Shop ')).toBe('boomev_shop');
    expect(normalizeShopKey(null)).toBe('');
  });
});

describe('buildShopIdentity (V2 — backend ShopInfo)', () => {
  it('uses the backend displayName / avatar / slug for any shop', () => {
    const identity = buildShopIdentity({ shop });
    expect(identity).toMatchObject({
      shopId: 'shop-alice-uuid',
      slug: 'alice_shop',
      displayName: 'Alice Shop',
      avatarUrl: 'https://cdn.boommall.app/avatar.jpg',
    });
  });

  it('detects ownership only via the signed-in shopId', () => {
    expect(buildShopIdentity({ shop, currentShopId: 'shop-alice-uuid' }).isOwner).toBe(true);
    expect(buildShopIdentity({ shop, currentShopId: 'shop-other' }).isOwner).toBe(false);
    expect(buildShopIdentity({ shop: null, currentShopId: 'shop-alice-uuid' }).isOwner).toBe(false);
  });

  it('falls back to the synced product shopName only when no backend shop is available', () => {
    const identity = buildShopIdentity({ shop: null, fallbackName: 'Boom EV Shop' });
    expect(identity.displayName).toBe('Boom EV Shop');
    expect(identity.avatarUrl).toBeNull();
    expect(identity.slug).toBe('');
  });

  it('never substitutes the auth/current profile name for another shop', () => {
    const identity = buildShopIdentity({
      shop,
      fallbackName: 'Boom EV Shop',
      currentShopId: 'shop-other-own',
    });
    expect(identity.displayName).toBe('Alice Shop');
    expect(identity.isOwner).toBe(false);
  });
});
