export type CommerceChannel = 'B2B' | 'B2C' | 'C2C';

export type WarehouseId = string;

export type Warehouse = {
  id: WarehouseId;
  name: string;
  city: string;
  channelFocus: CommerceChannel[];
};

export type CustomFieldType = 'text' | 'number' | 'select';

export type CustomFieldDef = {
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
};

export type CustomFieldValue = {
  key: string;
  value: string | number;
  /** Free-text spec name when the seller types their own rows */
  label?: string;
};

export type ProductMediaType = 'image' | 'video';

/** One gallery slot — cover is index 0 */
export type ProductMediaItem = {
  uri: string;
  type: ProductMediaType;
  sizeBytes?: number;
  /**
   * Poster / first-frame thumbnail for videos (always extracted for every video
   * at pick time so tiles & carousels render instantly without mounting a player).
   */
  thumbnailUri?: string;
};

/** Shopify/Amazon-style Master SKU */
export type MasterSku = {
  id: string;
  masterSku: string;
  title: string;
  brand: string;
  shopName: string;
  channel: CommerceChannel;
  basePrice: number;
  currency: 'THB';
  tags: string[];
  customFields: CustomFieldValue[];
  variantIds: string[];
  /** Shop that owns this product. Undefined = legacy data = my shop. */
  ownerShopId?: string;
  /** Explicit shop category key (falls back to tag/title inference when absent) */
  categoryKey?: string;
  /** Cover photo for shop-dashboard column cards (first image in media) */
  imageUri?: string;
  /** All product photos (legacy — prefer `media`) */
  imageUris?: string[];
  /** Ordered gallery. First item is cover (image or video). */
  media?: ProductMediaItem[];
  /** Long-form product article */
  description?: string;
  /** How-to / usage article */
  usageGuide?: string;
  /** Photos that illustrate specs (diagrams, labels, measurements) */
  specImages?: ProductMediaItem[];
  /** Photos / steps for how to use */
  usageImages?: ProductMediaItem[];
  /** Product barcode / EAN / UPC (unique across catalog when set) */
  barcode?: string;
  /** Short caption overlaid on the content card */
  caption?: string;
  /** ISO timestamp when the product was listed */
  createdAt?: string;
  /** True while an approved product promotion is active */
  isPromoted?: boolean;
};

/** Full product edit payload (PUT/PATCH equivalent) */
export type UpdateProductInput = {
  title?: string;
  masterSku?: string;
  barcode?: string | null;
  categoryKey?: string;
  description?: string;
  usageGuide?: string;
  specImages?: ProductMediaItem[];
  usageImages?: ProductMediaItem[];
  channel?: CommerceChannel;
  price?: number;
  cost?: number;
  availableTotal?: number;
  imageUris?: string[];
  media?: ProductMediaItem[];
  customFields?: CustomFieldValue[];
};

export type UpdateProductResult =
  | { ok: true }
  | { ok: false; reason: string; field?: 'title' | 'sku' | 'barcode' | 'price' | 'stock' | 'cost' };

export type SkuVariant = {
  id: string;
  masterSkuId: string;
  sku: string;
  label: string;
  /** Real photo for this option (BGV — required when listing with variants) */
  imageUri?: string;
  attrs: {
    color?: string;
    size?: string;
    voltage?: string;
    capacityAh?: number;
    weight?: string;
    /** Short per-option note (size/weight extras) */
    note?: string;
    /** Per-option free-text specs (legacy — prefer size / weight / note) */
    specs?: Array<{ label: string; value: string }>;
  };
  price: number;
  /** Unit cost for margin insight (optional) */
  cost?: number;
  /** Per-SKU low stock threshold (falls back to DEFAULT_LOW_STOCK_THRESHOLD) */
  lowStockThreshold?: number;
  status?: 'active' | 'hidden';
  moq?: number;
  wholesaleTiers?: Array<{ minQty: number; unitPrice: number }>;
};

/** Per-warehouse stock with optimistic revision (thread-safe sync) */
export type WarehouseStock = {
  variantId: string;
  warehouseId: WarehouseId;
  onHand: number;
  reserved: number;
  /** Monotonic revision for optimistic concurrency */
  revision: number;
};

export type CartLine = {
  variantId: string;
  warehouseId: WarehouseId;
  qty: number;
  unitPrice: number;
  /** Selected for checkout (Shopee-style cart checkboxes) */
  selected?: boolean;
};

export type StockMutationResult =
  | { ok: true; revision: number; available: number }
  | { ok: false; reason: 'INSUFFICIENT' | 'STALE_REVISION' | 'NOT_FOUND' | 'INVALID' };

/** Every stock change is journaled — no mutation without an audit trail */
export type StockLedgerType =
  | 'RESTOCK'
  | 'SALE'
  | 'ORDER_RESERVE'
  | 'ORDER_CANCEL'
  | 'RETURN'
  | 'MANUAL_ADJUSTMENT'
  | 'TRANSFER';

export type StockLedgerEntry = {
  id: string;
  type: StockLedgerType;
  variantId: string;
  sku: string;
  warehouseId: WarehouseId;
  /** Available stock (onHand - reserved) before the mutation */
  availableBefore: number;
  /** Signed change applied to available stock */
  qtyChange: number;
  /** Available stock after the mutation */
  availableAfter: number;
  /** Snapshot for full audit */
  onHandAfter: number;
  reservedAfter: number;
  reason?: string;
  orderRef?: string;
  actor: string;
  at: string;
};

export type StockStatus = 'ready' | 'low' | 'out';
