export function formatTHB(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function productCoverUrl(product: {
  media?: { uri: string }[];
  imageUris?: string[];
  imageUri?: string;
}): string | null {
  return product.media?.[0]?.uri ?? product.imageUris?.[0] ?? product.imageUri ?? null;
}
