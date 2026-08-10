import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyAutoSyncForNewProduct,
  hasPermission,
  installListings,
  inviteMember,
  memberOf,
  requestAccess,
  respondInvitation,
  respondRequest,
  revokeAccess,
  setMemberPermissions,
  type WarehouseData,
} from '../domain/warehouse-core';
import {
  MY_SHOP_ID,
  SEED_INVITATIONS,
  SEED_MEMBERS,
  SEED_REQUESTS,
  SEED_WAREHOUSES,
  SHOP_PROFILES,
} from '../data/seed';
import type {
  AutoSyncSetting,
  Listing,
  SharedWarehouse,
  ShopProfile,
  WarehousePermission,
  WarehouseRole,
} from '../domain/types';

export { MY_SHOP_ID } from '../data/seed';

type ActionResult = { ok: boolean; message: string };

type WarehouseState = WarehouseData & {
  profiles: ShopProfile[];
  // ---- selectors ----
  profileOf: (shopId: string) => ShopProfile | undefined;
  myWarehouse: () => SharedWarehouse | undefined;
  warehousesSharedWithMe: () => SharedWarehouse[];
  warehousesICanRequest: () => SharedWarehouse[];
  myListings: () => Listing[];
  canI: (warehouseId: string, permission: WarehousePermission) => boolean;
  autoSyncOf: (warehouseId: string) => AutoSyncSetting | undefined;
  // ---- actions (permission-checked in core) ----
  invite: (warehouseId: string, toShopId: string, role: WarehouseRole) => ActionResult;
  respondToInvitation: (invitationId: string, actorShopId: string, accept: boolean) => ActionResult;
  sendAccessRequest: (warehouseId: string, message?: string, fromShopId?: string) => ActionResult;
  respondToRequest: (requestId: string, approve: boolean, role?: WarehouseRole) => ActionResult;
  changeMemberRole: (warehouseId: string, targetShopId: string, role: WarehouseRole) => ActionResult;
  installCatalog: (warehouseId: string, masterSkuIds: string[], shopId?: string) => ActionResult;
  revoke: (warehouseId: string, targetShopId: string) => ActionResult;
  setListingStatus: (listingId: string, status: Listing['status']) => void;
  setAutoSync: (warehouseId: string, enabled: boolean, categoryKeys?: string[]) => void;
  onNewProductCreated: (warehouseId: string, masterSkuId: string, categoryKey?: string) => number;
};

function pickData(s: WarehouseState): WarehouseData {
  return {
    warehouses: s.warehouses,
    members: s.members,
    invitations: s.invitations,
    requests: s.requests,
    listings: s.listings,
    autoSync: s.autoSync,
    audit: s.audit,
  };
}

export const useWarehouseStore = create<WarehouseState>()(
  persist(
    (set, get) => ({
      warehouses: SEED_WAREHOUSES,
      members: SEED_MEMBERS,
      invitations: SEED_INVITATIONS,
      requests: SEED_REQUESTS,
      listings: [],
      autoSync: [],
      audit: [],
      profiles: SHOP_PROFILES,

      profileOf: (shopId) => get().profiles.find((p) => p.id === shopId),

      myWarehouse: () => get().warehouses.find((w) => w.ownerShopId === MY_SHOP_ID),

      warehousesSharedWithMe: () =>
        get().warehouses.filter(
          (w) => w.ownerShopId !== MY_SHOP_ID && memberOf(pickData(get()), w.id, MY_SHOP_ID),
        ),

      warehousesICanRequest: () =>
        get().warehouses.filter(
          (w) => w.ownerShopId !== MY_SHOP_ID && !memberOf(pickData(get()), w.id, MY_SHOP_ID),
        ),

      myListings: () => get().listings.filter((l) => l.shopId === MY_SHOP_ID),

      canI: (warehouseId, permission) =>
        hasPermission(pickData(get()), warehouseId, MY_SHOP_ID, permission),

      autoSyncOf: (warehouseId) =>
        get().autoSync.find((a) => a.warehouseId === warehouseId && a.shopId === MY_SHOP_ID),

      invite: (warehouseId, toShopId, role) => {
        const result = inviteMember(pickData(get()), Date.now(), {
          warehouseId,
          actorShopId: MY_SHOP_ID,
          toShopId,
          role,
        });
        if (!result.ok) return { ok: false, message: result.error };
        set({ invitations: result.invitations, audit: result.audit });
        return { ok: true, message: 'ส่งคำเชิญแล้ว — รอผู้รับตอบรับ' };
      },

      respondToInvitation: (invitationId, actorShopId, accept) => {
        const result = respondInvitation(pickData(get()), Date.now(), {
          invitationId,
          actorShopId,
          accept,
        });
        if (!result.ok) return { ok: false, message: result.error };
        set({ invitations: result.invitations, members: result.members, audit: result.audit });
        return { ok: true, message: accept ? 'ตอบรับคำเชิญแล้ว' : 'ปฏิเสธคำเชิญแล้ว' };
      },

      sendAccessRequest: (warehouseId, message, fromShopId = MY_SHOP_ID) => {
        const result = requestAccess(pickData(get()), Date.now(), {
          warehouseId,
          fromShopId,
          message,
        });
        if (!result.ok) return { ok: false, message: result.error };
        set({ requests: result.requests, audit: result.audit });
        return { ok: true, message: 'ส่งคำขอใช้คลังแล้ว — รอเจ้าของคลังอนุมัติ' };
      },

      respondToRequest: (requestId, approve, role) => {
        const result = respondRequest(pickData(get()), Date.now(), {
          requestId,
          actorShopId: MY_SHOP_ID,
          approve,
          role,
        });
        if (!result.ok) return { ok: false, message: result.error };
        set({ requests: result.requests, members: result.members, audit: result.audit });
        return { ok: true, message: approve ? 'อนุมัติคำขอแล้ว' : 'ปฏิเสธคำขอแล้ว' };
      },

      changeMemberRole: (warehouseId, targetShopId, role) => {
        const result = setMemberPermissions(pickData(get()), Date.now(), {
          warehouseId,
          actorShopId: MY_SHOP_ID,
          targetShopId,
          role,
        });
        if (!result.ok) return { ok: false, message: result.error };
        set({ members: result.members, audit: result.audit });
        return { ok: true, message: `เปลี่ยนบทบาทเป็น ${role} แล้ว` };
      },

      installCatalog: (warehouseId, masterSkuIds, shopId = MY_SHOP_ID) => {
        const result = installListings(pickData(get()), Date.now(), {
          warehouseId,
          actorShopId: shopId,
          shopId,
          masterSkuIds,
        });
        if (!result.ok) return { ok: false, message: result.error };
        set({ listings: result.listings, audit: result.audit });
        return {
          ok: true,
          message:
            result.installedCount > 0
              ? `ติดตั้ง ${result.installedCount} สินค้าเข้าหน้าร้านแล้ว`
              : 'สินค้าที่เลือกถูกติดตั้งไว้แล้วทั้งหมด (กันซ้ำอัตโนมัติ)',
        };
      },

      revoke: (warehouseId, targetShopId) => {
        const result = revokeAccess(pickData(get()), Date.now(), {
          warehouseId,
          actorShopId: MY_SHOP_ID,
          targetShopId,
        });
        if (!result.ok) return { ok: false, message: result.error };
        set({
          members: result.members,
          listings: result.listings,
          autoSync: result.autoSync,
          audit: result.audit,
        });
        return { ok: true, message: 'ถอนสิทธิ์แล้ว — Listing ถูกปิด แต่ประวัติยังอยู่' };
      },

      setListingStatus: (listingId, status) =>
        set((s) => ({
          listings: s.listings.map((l) =>
            l.id === listingId
              ? { ...l, status, disabledReason: status === 'disabled' ? 'ปิดโดยร้านค้า' : undefined }
              : l,
          ),
        })),

      setAutoSync: (warehouseId, enabled, categoryKeys) =>
        set((s) => {
          const rest = s.autoSync.filter(
            (a) => !(a.warehouseId === warehouseId && a.shopId === MY_SHOP_ID),
          );
          return {
            autoSync: [...rest, { shopId: MY_SHOP_ID, warehouseId, enabled, categoryKeys }],
            audit: [
              {
                id: `aud-${Date.now()}`,
                warehouseId,
                actorShopId: MY_SHOP_ID,
                action: 'AUTO_SYNC_CHANGED' as const,
                detail: enabled
                  ? `เปิดรับสินค้าใหม่อัตโนมัติ${categoryKeys?.length ? ` (${categoryKeys.join(', ')})` : ' (ทุกหมวด)'}`
                  : 'ปิดรับสินค้าใหม่อัตโนมัติ',
                at: new Date().toISOString(),
              },
              ...s.audit,
            ],
          };
        }),

      onNewProductCreated: (warehouseId, masterSkuId, categoryKey) => {
        const result = applyAutoSyncForNewProduct(pickData(get()), Date.now(), {
          warehouseId,
          masterSkuId,
          categoryKey,
        });
        set({ listings: result.listings, audit: result.audit });
        return result.createdFor.length;
      },
    }),
    {
      name: 'boommall-warehouse-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        members: s.members,
        invitations: s.invitations,
        requests: s.requests,
        listings: s.listings,
        autoSync: s.autoSync,
        audit: s.audit,
      }),
    },
  ),
);
