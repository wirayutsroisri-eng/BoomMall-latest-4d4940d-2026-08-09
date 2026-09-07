import type { MasterSku, ProductMediaItem, SkuVariant, WarehouseStock } from '../domain/types';
import { isRemoteMediaUrl, isVideoMedia } from '../domain/product-media';
import { uploadMediaAsset } from '@/modules/media/data/mediaAssetApi';
import { mediaAssetSource } from '@/modules/media/domain/mediaAsset';

/**
 * Product catalog persistence fix — device-independent media.
 *
 * Product photos/videos used to be stored as local `file://` document paths in
 * CommerceProduct.payloadJson. Those paths only exist on the device that picked
 * them, so the image disappeared after reinstall / OS purge / opening from
 * another device. This module uploads every local media file to object storage
 * (reusing the existing media-assets/S3 pipeline that feed & chat already use)
 * and returns a stable public canonical URL to persist instead.
 *
 * Already-remote http(s) references are passed through untouched, so editing a
 * product never re-uploads images that are already on the server.
 */

export type CatalogBundleLike = {
  product: MasterSku;
  variants: SkuVariant[];
  stock: WarehouseStock[];
};

/**
 * Uploads a local media file to object storage and returns the canonical
 * http(s) URL. Injectable for unit tests; defaults to the real S3/media-assets
 * pipeline used by feed & chat.
 */
export type ProductMediaUploader = (uri: string, type: 'image' | 'video') => Promise<string>;

export async function defaultProductMediaUploader(
  uri: string,
  type: 'image' | 'video',
): Promise<string> {
  const asset = await uploadMediaAsset({ uri, type });
  const canonical = mediaAssetSource(asset);
  if (!isRemoteMediaUrl(canonical)) {
    throw new Error(`PRODUCT_MEDIA_REMOTE_URL_INVALID ${canonical}`);
  }
  return canonical;
}

function isVideoUri(uri: string) {
  return isVideoMedia({ uri, type: 'image' });
}

/** Missing-file errors mean a legacy device path that no longer exists — keep it. */
function isMissingLocalFileError(error: unknown) {
  return error instanceof Error && error.message === 'MEDIA_LOCAL_FILE_MISSING';
}

/** Upload one local media file (image or video) and return its canonical http(s) URL. */
async function uploadSourceToCanonicalUrl(
  uri: string,
  uploader: ProductMediaUploader,
): Promise<string> {
  if (isRemoteMediaUrl(uri)) return uri;
  try {
    return await uploader(uri, isVideoUri(uri) ? 'video' : 'image');
  } catch (error) {
    if (isMissingLocalFileError(error)) return uri;
    throw error;
  }
}

async function uploadOneItem(
  item: ProductMediaItem,
  uploader: ProductMediaUploader,
): Promise<ProductMediaItem> {
  try {
    // Local video poster (thumbnailUri) also lives on the device — upload it too.
    let thumbnailUri = item.thumbnailUri;
    if (thumbnailUri && !isRemoteMediaUrl(thumbnailUri)) {
      try {
        thumbnailUri = await uploader(thumbnailUri, 'image');
      } catch (error) {
        if (!isMissingLocalFileError(error)) throw error;
      }
    }
    if (isRemoteMediaUrl(item.uri)) {
      return thumbnailUri === item.thumbnailUri ? item : { ...item, thumbnailUri };
    }
    const canonical = await uploader(item.uri, isVideoMedia(item) ? 'video' : 'image');
    return {
      uri: canonical,
      type: item.type,
      sizeBytes: item.sizeBytes,
      ...(thumbnailUri ? { thumbnailUri } : {}),
    };
  } catch (error) {
    if (isMissingLocalFileError(error)) return item;
    throw error;
  }
}

/** Upload the local pieces of a product bundle; returns a bundle safe to persist. */
export async function prepareBundleForServer(
  bundle: CatalogBundleLike,
  uploader: ProductMediaUploader = defaultProductMediaUploader,
): Promise<CatalogBundleLike> {
  const { product, variants, stock } = bundle;
  // Sequential on purpose: dedupe only prevents double upload when the same
  // local file appears in several fields (media + imageUri + imageUris + SKU).
  const dedupe = new Map<string, string>();

  const canonicalizeUri = async (uri?: string): Promise<string | undefined> => {
    if (!uri || isRemoteMediaUrl(uri)) return uri;
    const cached = dedupe.get(uri);
    if (cached) return cached;
    const canonical = await uploadSourceToCanonicalUrl(uri, uploader);
    dedupe.set(uri, canonical);
    return canonical;
  };

  const canonicalizeItems = async (
    items?: ProductMediaItem[],
  ): Promise<ProductMediaItem[] | undefined> => {
    if (!items?.length) return items;
    const out: ProductMediaItem[] = [];
    for (const item of items) {
      if (!isRemoteMediaUrl(item.uri)) {
        const cached = dedupe.get(item.uri);
        if (cached && !item.thumbnailUri) {
          out.push({ ...item, uri: cached });
          continue;
        }
      }
      const uploaded = await uploadOneItem(item, uploader);
      if (!isRemoteMediaUrl(item.uri)) dedupe.set(item.uri, uploaded.uri);
      out.push(uploaded);
    }
    return out;
  };

  const media = await canonicalizeItems(product.media);
  const specImages = await canonicalizeItems(product.specImages);
  const usageImages = await canonicalizeItems(product.usageImages);
  const imageUri = await canonicalizeUri(product.imageUri);
  const imageUris = product.imageUris?.length
    ? (await Promise.all(product.imageUris.map((uri) => canonicalizeUri(uri)))).filter(
        (uri): uri is string => typeof uri === 'string',
      )
    : undefined;
  const nextVariants: SkuVariant[] = [];
  for (const variant of variants) {
    nextVariants.push({ ...variant, imageUri: await canonicalizeUri(variant.imageUri) });
  }

  const nextProduct: MasterSku = {
    ...product,
    media,
    specImages,
    usageImages,
    imageUri,
    imageUris,
  };
  return { product: nextProduct, variants: nextVariants, stock };
}

