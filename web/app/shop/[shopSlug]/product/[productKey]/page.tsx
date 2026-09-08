import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchCatalogProduct } from '@/lib/api';
import { formatTHB, productCoverUrl } from '@/lib/format';
import { productDeepLink, productWebUrl } from '@/lib/canonical';

type Props = { params: Promise<{ shopSlug: string; productKey: string }> };

/**
 * One direct query (GET /api/v1/catalog/products/:key, slug OR id) — no
 * longer loads the shop's full product list to find one item. `shopSlug` in
 * the URL must match the product's actual shop, so a product can't be
 * reached under the wrong shop's canonical path.
 */
async function loadProduct(shopSlug: string, productKey: string) {
  const bundle = await fetchCatalogProduct(productKey);
  if (!bundle?.shop || bundle.shop.slug !== shopSlug) return null;
  return bundle;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug, productKey } = await params;
  const bundle = await loadProduct(shopSlug, productKey);
  if (!bundle) return {};
  const { product } = bundle;
  const cover = productCoverUrl(product);
  const canonicalKey = product.slug ?? product.id;
  return {
    title: `${product.title} — BoomMall`,
    description: product.description ?? product.title,
    alternates: { canonical: productWebUrl(shopSlug, canonicalKey) },
    openGraph: {
      title: product.title,
      url: productWebUrl(shopSlug, canonicalKey),
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { shopSlug, productKey } = await params;
  const bundle = await loadProduct(shopSlug, productKey);
  if (!bundle) notFound();
  const { product } = bundle;
  const cover = productCoverUrl(product);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: cover ?? undefined,
    description: product.description,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'THB',
      price: product.basePrice,
      availability: 'https://schema.org/InStock',
      url: productWebUrl(shopSlug, product.slug ?? product.id),
    },
  };

  return (
    <main className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {cover ? (
        <img src={cover} alt={product.title} style={{ width: '100%', maxWidth: 480, borderRadius: 12 }} />
      ) : null}

      <h1 style={{ fontSize: 20, marginTop: 16 }}>{product.title}</h1>
      <div className="price" style={{ fontSize: 20 }}>
        {formatTHB(product.basePrice)}
      </div>

      {product.description ? <p style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{product.description}</p> : null}

      <a
        href={productDeepLink(product.id)}
        style={{ display: 'inline-block', marginTop: 24, padding: '10px 18px', borderRadius: 8, background: '#111', color: '#fff' }}
      >
        เปิด/ซื้อในแอป BoomMall
      </a>
    </main>
  );
}
