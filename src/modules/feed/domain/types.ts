export type FeedTab = 'nearby' | 'following' | 'foryou';

export type CommerceTier = 'B2B' | 'B2C' | 'C2C';

export type ProductVariant = {
  id: string;
  label: string;
  voltage?: string;
  capacityAh?: number;
  color?: string;
  size?: string;
  price: number;
  stock: number;
  moq?: number;
  wholesaleTiers?: Array<{ minQty: number; unitPrice: number }>;
};

export type FeedProduct = {
  id: string;
  name: string;
  shopName: string;
  tier: CommerceTier;
  basePrice: number;
  currency: 'THB';
  variants: ProductVariant[];
  tags: string[];
};

export type FeedItem = {
  id: string;
  author: string;
  authorHandle: string;
  caption: string;
  location: string;
  likes: number;
  comments: number;
  shares: number;
  isLive: boolean;
  musicTitle: string;
  gradient: [string, string];
  product: FeedProduct;
  liked?: boolean;
  saved?: boolean;
  /** Real photo/video picked from device — overrides gradient background when present */
  imageUri?: string;
  videoUri?: string;
  /** true when created via the in-app Camera/Creator Studio during this session */
  isUserPost?: boolean;
};

export type FeedComment = {
  id: string;
  feedId: string;
  author: string;
  authorInitial: string;
  text: string;
  likes: number;
  createdAt: string;
  liked?: boolean;
};
