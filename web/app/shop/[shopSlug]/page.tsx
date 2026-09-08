import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchShop, fetchShopProducts } from '@/lib/api';
import { formatTHB, productCoverUrl } from '@/lib/format';
import { productWebPath, shopDeepLink, shopWebUrl } from '@/lib/canonical';

type Props = { params: Promise<{ shopSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug } = await params;
  const shop = await fetchShop(shopSlug);
  if (!shop) return {};
  const title = shop.displayName ?? shopSlug;
  return {
    title: `${title} — BoomMall`,
    description: `ร้าน ${title} บน BoomMall`,
    alternates: { canonical: shopWebUrl(shop.slug) },
    openGraph: {
      title,
      url: shopWebUrl(shop.slug),
      images: shop.avatarUrl ? [shop.avatarUrl] : undefined,
    },
  };
}

export default async function ShopPage({ params }: Props) {
  const { shopSlug } = await params;
  const shop = await fetchShop(shopSlug);
  if (!shop) notFound();

  const storefront = await fetchShopProducts(shopSlug);
  const products = storefront?.products ?? [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: shop.displayName ?? shop.slug,
    url: shopWebUrl(shop.slug),
    image: shop.avatarUrl ?? undefined,
  };

  return (
    <main className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="hero">
        {shop.avatarUrl ? <img src={shop.avatarUrl} alt="" /> : <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eee' }} />}
        <div>
          <h1>{shop.displayName ?? shop.slug}</h1>
          <a href={shopDeepLink(shop.slug)} style={{ fontSize: 13, color: '#0066cc' }}>
            เปิดในแอป BoomMall →
          </a>
        </div>
      </div>

      {products.length === 0 ? (
        <p>ร้านนี้ยังไม่มีสินค้า</p>
      ) : (
        <div className="grid">
          {products.map(({ product }) => {
            const cover = productCoverUrl(product);
            return (
              <Link key={product.id} href={productWebPath(shop.slug, product.slug ?? product.id)} className="card">
                {cover ? <img src={cover} alt={product.title} /> : <div style={{ aspectRatio: '1 / 1', background: '#f0f0f0' }} />}
                <div className="body">
                  <div className="title">{product.title}</div>
                  <div className="price">{formatTHB(product.basePrice)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
