import type {
  SharedWarehouse,
  ShopProfile,
  WarehouseAccessRequest,
  WarehouseInvitation,
  WarehouseMember,
} from '../domain/types';

/** Production starts empty; authenticated identity is bound at runtime. */
export const CURRENT_SHOP_PLACEHOLDER = '__authenticated_shop__';
export const SHOP_PROFILES: ShopProfile[] = [];
export const SEED_WAREHOUSES: SharedWarehouse[] = [];
export const SEED_MEMBERS: WarehouseMember[] = [];
export const SEED_INVITATIONS: WarehouseInvitation[] = [];
export const SEED_REQUESTS: WarehouseAccessRequest[] = [];
