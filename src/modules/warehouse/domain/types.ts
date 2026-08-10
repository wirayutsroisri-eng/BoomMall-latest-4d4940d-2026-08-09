/**
 * Shared Warehouse domain — PRODUCT / SKU / INVENTORY stay in the commerce
 * module (single source of truth). This module adds the LISTING layer plus
 * membership, invitations, requests, permissions and audit.
 */

export type WarehouseRole = 'OWNER' | 'ADMIN' | 'INVENTORY_MANAGER' | 'SELLER' | 'VIEWER';

export type WarehousePermission =
  | 'VIEW_PRODUCTS'
  | 'USE_PRODUCTS'
  | 'CREATE_LISTING'
  | 'EDIT_LISTING'
  | 'EDIT_PRICE'
  | 'VIEW_STOCK'
  | 'EDIT_STOCK'
  | 'ADD_PRODUCT'
  | 'MANAGE_ORDER'
  | 'MANAGE_MEMBER';

export type ShopProfile = {
  id: string;
  name: string;
  handle: string;
  email?: string;
  avatarColor: string;
};

export type SharedWarehouse = {
  id: string;
  name: string;
  ownerShopId: string;
  description?: string;
  coverColor: string;
};

export type WarehouseMember = {
  warehouseId: string;
  shopId: string;
  role: WarehouseRole;
  permissions: WarehousePermission[];
  addedAt: string;
  addedBy: string;
};

export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export type WarehouseInvitation = {
  id: string;
  warehouseId: string;
  fromShopId: string;
  toShopId: string;
  role: WarehouseRole;
  status: InvitationStatus;
  createdAt: string;
  respondedAt?: string;
};

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

export type WarehouseAccessRequest = {
  id: string;
  warehouseId: string;
  fromShopId: string;
  message?: string;
  status: AccessRequestStatus;
  createdAt: string;
  respondedAt?: string;
};

export type SyncPolicy = 'MASTER_CONTROLLED' | 'SELLER_OVERRIDE_ALLOWED';

/**
 * LISTING = "product X is sold on shop Y".
 * References the master product — never duplicates product/SKU/inventory.
 */
export type Listing = {
  id: string;
  shopId: string;
  warehouseId: string;
  masterSkuId: string;
  status: 'active' | 'disabled';
  syncPolicy: SyncPolicy;
  /** Allowed only when syncPolicy is SELLER_OVERRIDE_ALLOWED */
  priceOverride?: number;
  installedAt: string;
  disabledReason?: string;
};

export type AutoSyncSetting = {
  shopId: string;
  warehouseId: string;
  enabled: boolean;
  /** Empty/undefined = all categories */
  categoryKeys?: string[];
};

export type WarehouseAuditEntry = {
  id: string;
  warehouseId: string;
  actorShopId: string;
  action:
    | 'INVITE_SENT'
    | 'INVITE_ACCEPTED'
    | 'INVITE_REJECTED'
    | 'REQUEST_SENT'
    | 'REQUEST_APPROVED'
    | 'REQUEST_REJECTED'
    | 'PERMISSION_CHANGED'
    | 'MEMBER_REVOKED'
    | 'LISTINGS_INSTALLED'
    | 'LISTING_DISABLED'
    | 'AUTO_SYNC_CHANGED';
  targetShopId?: string;
  detail: string;
  at: string;
};
