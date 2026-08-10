import type {
  SharedWarehouse,
  ShopProfile,
  WarehouseAccessRequest,
  WarehouseInvitation,
  WarehouseMember,
} from '../domain/types';
import { ROLE_PERMISSIONS } from '../domain/warehouse-core';

/** The signed-in seller profile (reuses the single mock account of the app) */
export const MY_SHOP_ID = 'shop-boom-ev';

export const SHOP_PROFILES: ShopProfile[] = [
  {
    id: MY_SHOP_ID,
    name: 'Boom EV Shop Chanthaburi',
    handle: '@boom_chanthaburi',
    email: 'boom@boommall.app',
    avatarColor: '#00A86B',
  },
  {
    id: 'shop-evparts',
    name: 'โรงงาน EV Parts จันทบุรี',
    handle: '@evparts_factory',
    email: 'contact@evparts.co.th',
    avatarColor: '#2E8CFF',
  },
  {
    id: 'shop-fleet',
    name: 'Boom Fleet Hub Rayong',
    handle: '@fleet_rayong',
    email: 'fleet@boommall.app',
    avatarColor: '#C9A227',
  },
  {
    id: 'shop-minmart',
    name: 'ร้านมินิมาร์ทช่างมิ้นท์',
    handle: '@minmart_ev',
    email: 'mint@boommall.app',
    avatarColor: '#FE2C55',
  },
  {
    id: 'shop-sky',
    name: 'Sky EV Scooter Shop',
    handle: '@sky_ev',
    email: 'sky@boommall.app',
    avatarColor: '#8B5CF6',
  },
];

export const SEED_WAREHOUSES: SharedWarehouse[] = [
  {
    id: 'wh-boom-ev',
    name: 'คลัง Boom EV',
    ownerShopId: MY_SHOP_ID,
    description: 'คลังสินค้าหลักของร้าน — แบตเตอรี่ อะไหล่ งาน CNC',
    coverColor: '#0B3D2E',
  },
  {
    id: 'wh-evparts',
    name: 'คลังโรงงาน EV Parts',
    ownerShopId: 'shop-evparts',
    description: 'อะไหล่โรงงานราคาส่ง — Controller, Motor, แบตเตอรี่ Grade A',
    coverColor: '#12314A',
  },
  {
    id: 'wh-fleet',
    name: 'คลัง Fleet Hub Rayong',
    ownerShopId: 'shop-fleet',
    description: 'อุปกรณ์ Fleet/B2B — ตู้สลับแบต, GPS Tracker',
    coverColor: '#4A3A12',
  },
];

export const SEED_MEMBERS: WarehouseMember[] = [
  {
    warehouseId: 'wh-boom-ev',
    shopId: MY_SHOP_ID,
    role: 'OWNER',
    permissions: [...ROLE_PERMISSIONS.OWNER],
    addedAt: '2026-01-01T00:00:00.000Z',
    addedBy: MY_SHOP_ID,
  },
  {
    warehouseId: 'wh-evparts',
    shopId: 'shop-evparts',
    role: 'OWNER',
    permissions: [...ROLE_PERMISSIONS.OWNER],
    addedAt: '2026-01-01T00:00:00.000Z',
    addedBy: 'shop-evparts',
  },
  {
    warehouseId: 'wh-fleet',
    shopId: 'shop-fleet',
    role: 'OWNER',
    permissions: [...ROLE_PERMISSIONS.OWNER],
    addedAt: '2026-01-01T00:00:00.000Z',
    addedBy: 'shop-fleet',
  },
  // Boom EV was invited to (and accepted) the EV Parts factory warehouse earlier
  {
    warehouseId: 'wh-evparts',
    shopId: MY_SHOP_ID,
    role: 'SELLER',
    permissions: [...ROLE_PERMISSIONS.SELLER],
    addedAt: '2026-06-10T00:00:00.000Z',
    addedBy: 'shop-evparts',
  },
];

export const SEED_INVITATIONS: WarehouseInvitation[] = [
  {
    id: 'inv-seed-1',
    warehouseId: 'wh-boom-ev',
    fromShopId: MY_SHOP_ID,
    toShopId: 'shop-sky',
    role: 'SELLER',
    status: 'pending',
    createdAt: '2026-08-08T09:00:00.000Z',
  },
];

export const SEED_REQUESTS: WarehouseAccessRequest[] = [
  {
    id: 'req-seed-1',
    warehouseId: 'wh-boom-ev',
    fromShopId: 'shop-minmart',
    message: 'ขอนำแบตเตอรี่กับอะไหล่ไปขายหน้าร้านมินิมาร์ทค่ะ',
    status: 'pending',
    createdAt: '2026-08-09T14:30:00.000Z',
  },
];
