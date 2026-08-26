import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentShopId, useAuthStore } from '@/modules/auth/state/auth-store';
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
  ROLE_PERMISSIONS,
  type WarehouseData,
} from '../domain/warehouse-core';
import {
  CURRENT_SHOP_PLACEHOLDER,
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

type ActionResult = { ok: boolean; message: string };

function mine() {
  return currentShopId();
}

function withCurrentShop<T>(rows: T[]): T[] {
  const shopId = useAuthStore.getState().user?.shopId ?? CURRENT_SHOP_PLACEHOLDER;
  return rows.map((row) => {
    const value = row as Record<string, unknown>;
    const next = { ...value };
    for (const key of ['id', 'shopId', 'ownerShopId', 'actorShopId', 'fromShopId', 'toShopId', 'addedBy']) {
      if (next[key] === CURRENT_SHOP_PLACEHOLDER) next[key] = shopId;
    }
    return next as T;
  });
}

const LEGACY_DEMO_WAREHOUSE_IDS = new Set(['wh-boom-ev', 'wh-evparts', 'wh-fleet']);
const LEGACY_DEMO_SHOP_IDS = new Set([
  '__authenticated_shop__',
  'shop-evparts',
  'shop-fleet',
  'shop-minmart',
  'shop-sky',
]);

type WarehouseState = WarehouseData & {
  profiles: ShopProfile[];
  bindShopIdentity: (shopId: string) => void;
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
      warehouses: withCurrentShop(SEED_WAREHOUSES),
      members: withCurrentShop(SEED_MEMBERS),
      invitations: withCurrentShop(SEED_INVITATIONS),
      requests: withCurrentShop(SEED_REQUESTS),
      listings: [],
      autoSync: [],
      audit: [],
      profiles: withCurrentShop(SHOP_PROFILES),

      bindShopIdentity: (shopId) => {
        if (!shopId.trim()) return;
        set((state) => {
          const personalWarehouse = state.warehouses.find((w) => w.ownerShopId === shopId);
          const previous = personalWarehouse?.ownerShopId ?? CURRENT_SHOP_PLACEHOLDER;
          const remap = <T,>(rows: T[]): T[] => rows.map((row) => {
            const next = { ...(row as Record<string, unknown>) };
            for (const key of ['id', 'shopId', 'ownerShopId', 'actorShopId', 'fromShopId', 'toShopId', 'addedBy']) {
              if (next[key] === previous || next[key] === CURRENT_SHOP_PLACEHOLDER) next[key] = shopId;
            }
            return next as T;
          });
          const warehouses = remap(state.warehouses);
          const warehouseId = personalWarehouse?.id ?? `warehouse:${shopId}`;
          if (!warehouses.some((w) => w.ownerShopId === shopId)) {
            warehouses.unshift({
              id: warehouseId,
              name: 'คลังหลัก',
              ownerShopId: shopId,
              description: 'คลังสินค้าของร้าน',
              coverColor: '#0B3D2E',
            });
          }
          const members = remap(state.members);
          if (!members.some((m) => m.warehouseId === warehouseId && m.shopId === shopId)) {
            members.unshift({
              warehouseId,
              shopId,
              role: 'OWNER',
              permissions: [...ROLE_PERMISSIONS.OWNER],
              addedAt: new Date().toISOString(),
              addedBy: shopId,
            });
          }
          const profiles = remap(state.profiles);
          const authUser = useAuthStore.getState().user;
          if (!profiles.some((p) => p.id === shopId)) {
            profiles.unshift({
              id: shopId,
              name: authUser?.displayName ?? 'ร้านของฉัน',
              handle: authUser?.handle ?? `@${shopId.slice(0, 8)}`,
              avatarColor: '#00A86B',
            });
          }
          return {
            warehouses,
            members,
            invitations: remap(state.invitations),
            requests: remap(state.requests),
            listings: remap(state.listings),
            autoSync: remap(state.autoSync),
            audit: remap(state.audit),
            profiles,
          };
        });
      },

      profileOf: (shopId) => get().profiles.find((p) => p.id === shopId),

      myWarehouse: () => get().warehouses.find((w) => w.ownerShopId === mine()),

      warehousesSharedWithMe: () =>
        get().warehouses.filter(
          (w) => w.ownerShopId !== mine() && memberOf(pickData(get()), w.id, mine()),
        ),

      warehousesICanRequest: () =>
        get().warehouses.filter(
          (w) => w.ownerShopId !== mine() && !memberOf(pickData(get()), w.id, mine()),
        ),

      myListings: () => get().listings.filter((l) => l.shopId === mine()),

      canI: (warehouseId, permission) =>
        hasPermission(pickData(get()), warehouseId, mine(), permission),

      autoSyncOf: (warehouseId) =>
        get().autoSync.find((a) => a.warehouseId === warehouseId && a.shopId === mine()),

      invite: (warehouseId, toShopId, role) => {
        const result = inviteMember(pickData(get()), Date.now(), {
          warehouseId,
          actorShopId: mine(),
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

      sendAccessRequest: (warehouseId, message, fromShopId = mine()) => {
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
          actorShopId: mine(),
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
          actorShopId: mine(),
          targetShopId,
          role,
        });
        if (!result.ok) return { ok: false, message: result.error };
        set({ members: result.members, audit: result.audit });
        return { ok: true, message: `เปลี่ยนบทบาทเป็น ${role} แล้ว` };
      },

      installCatalog: (warehouseId, masterSkuIds, shopId = mine()) => {
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
          actorShopId: mine(),
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
            (a) => !(a.warehouseId === warehouseId && a.shopId === mine()),
          );
          return {
            autoSync: [...rest, { shopId: mine(), warehouseId, enabled, categoryKeys }],
            audit: [
              {
                id: `aud-${Date.now()}`,
                warehouseId,
                actorShopId: mine(),
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
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<WarehouseState>;
        return {
          ...state,
          warehouses: (state.warehouses ?? []).filter(
            (row) => !LEGACY_DEMO_WAREHOUSE_IDS.has(row.id),
          ),
          members: (state.members ?? []).filter(
            (row) =>
              !LEGACY_DEMO_WAREHOUSE_IDS.has(row.warehouseId) &&
              !LEGACY_DEMO_SHOP_IDS.has(row.shopId),
          ),
          invitations: (state.invitations ?? []).filter(
            (row) => !LEGACY_DEMO_WAREHOUSE_IDS.has(row.warehouseId),
          ),
          requests: (state.requests ?? []).filter(
            (row) => !LEGACY_DEMO_WAREHOUSE_IDS.has(row.warehouseId),
          ),
          listings: (state.listings ?? []).filter(
            (row) => !LEGACY_DEMO_WAREHOUSE_IDS.has(row.warehouseId),
          ),
          autoSync: (state.autoSync ?? []).filter(
            (row) => !LEGACY_DEMO_WAREHOUSE_IDS.has(row.warehouseId),
          ),
          audit: (state.audit ?? []).filter(
            (row) => !LEGACY_DEMO_WAREHOUSE_IDS.has(row.warehouseId),
          ),
        };
      },
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
