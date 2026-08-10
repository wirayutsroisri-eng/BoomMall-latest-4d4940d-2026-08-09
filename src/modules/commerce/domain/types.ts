export type CommerceChannel = 'B2B' | 'B2C' | 'C2C';

export type WarehouseId = 'WH-CTI-MAIN' | 'WH-CTI-SERVICE' | 'WH-B2B-HUB' | 'WH-C2C-LOCKER';

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
  /** Cover photo for shop-dashboard column cards (first of imageUris) */
  imageUri?: string;
  /** All product photos (permanent local URIs) */
  imageUris?: string[];
  /** Free-text product description */
  description?: string;
  /** Short caption overlaid on the content card */
  caption?: string;
  /** ISO timestamp when the product was listed */
  createdAt?: string;
};

export type SkuVariant = {
  id: string;
  masterSkuId: string;
  sku: string;
  label: string;
  attrs: {
    color?: string;
    size?: string;
    voltage?: string;
    capacityAh?: number;
  };
  price: number;
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
};

export type StockMutationResult =
  | { ok: true; revision: number; available: number }
  | { ok: false; reason: 'INSUFFICIENT' | 'STALE_REVISION' | 'NOT_FOUND' };
