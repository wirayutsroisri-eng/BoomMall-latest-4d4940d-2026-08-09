import type {
  AutoSyncSetting,
  Listing,
  SharedWarehouse,
  WarehouseAccessRequest,
  WarehouseAuditEntry,
  WarehouseInvitation,
  WarehouseMember,
  WarehousePermission,
  WarehouseRole,
} from './types';

/**
 * Pure shared-warehouse logic. Every mutating operation:
 *  1. verifies actor permission (no "client sends warehouse_id and gets in"),
 *  2. guards against duplicates (listing / invitation / request),
 *  3. returns the changed slices + an audit entry.
 * No React Native imports allowed in this file.
 */

export const ROLE_PERMISSIONS: Record<WarehouseRole, WarehousePermission[]> = {
  OWNER: [
    'VIEW_PRODUCTS', 'USE_PRODUCTS', 'CREATE_LISTING', 'EDIT_LISTING', 'EDIT_PRICE',
    'VIEW_STOCK', 'EDIT_STOCK', 'ADD_PRODUCT', 'MANAGE_ORDER', 'MANAGE_MEMBER',
  ],
  ADMIN: [
    'VIEW_PRODUCTS', 'USE_PRODUCTS', 'CREATE_LISTING', 'EDIT_LISTING', 'EDIT_PRICE',
    'VIEW_STOCK', 'EDIT_STOCK', 'ADD_PRODUCT', 'MANAGE_ORDER',
  ],
  INVENTORY_MANAGER: ['VIEW_PRODUCTS', 'VIEW_STOCK', 'EDIT_STOCK', 'ADD_PRODUCT'],
  SELLER: ['VIEW_PRODUCTS', 'USE_PRODUCTS', 'CREATE_LISTING', 'EDIT_LISTING', 'VIEW_STOCK'],
  VIEWER: ['VIEW_PRODUCTS', 'VIEW_STOCK'],
};

export const ROLE_LABEL: Record<WarehouseRole, string> = {
  OWNER: 'เจ้าของคลัง',
  ADMIN: 'ผู้ดูแล',
  INVENTORY_MANAGER: 'ผู้จัดการสต็อก',
  SELLER: 'ผู้ขาย',
  VIEWER: 'ผู้ชม',
};

export type WarehouseData = {
  warehouses: SharedWarehouse[];
  members: WarehouseMember[];
  invitations: WarehouseInvitation[];
  requests: WarehouseAccessRequest[];
  listings: Listing[];
  autoSync: AutoSyncSetting[];
  audit: WarehouseAuditEntry[];
};

export type CoreResult<T extends Partial<WarehouseData>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

let seq = 0;
function newId(prefix: string, now: number) {
  seq = (seq + 1) % 10000;
  return `${prefix}-${now}-${seq}`;
}

function auditEntry(
  now: number,
  warehouseId: string,
  actorShopId: string,
  action: WarehouseAuditEntry['action'],
  detail: string,
  targetShopId?: string,
): WarehouseAuditEntry {
  return {
    id: newId('aud', now),
    warehouseId,
    actorShopId,
    action,
    targetShopId,
    detail,
    at: new Date(now).toISOString(),
  };
}

export function memberOf(data: WarehouseData, warehouseId: string, shopId: string) {
  return data.members.find((m) => m.warehouseId === warehouseId && m.shopId === shopId);
}

export function hasPermission(
  data: WarehouseData,
  warehouseId: string,
  shopId: string,
  permission: WarehousePermission,
): boolean {
  const member = memberOf(data, warehouseId, shopId);
  if (!member) return false;
  return member.role === 'OWNER' || member.permissions.includes(permission);
}

export function isOwner(data: WarehouseData, warehouseId: string, shopId: string) {
  const wh = data.warehouses.find((w) => w.id === warehouseId);
  return wh?.ownerShopId === shopId;
}

// ---------------------------------------------------------------------------
// Invitations (Owner → member)
// ---------------------------------------------------------------------------

export function inviteMember(
  data: WarehouseData,
  now: number,
  input: { warehouseId: string; actorShopId: string; toShopId: string; role: WarehouseRole },
): CoreResult<{ invitations: WarehouseInvitation[]; audit: WarehouseAuditEntry[] }> {
  const { warehouseId, actorShopId, toShopId, role } = input;
  if (!hasPermission(data, warehouseId, actorShopId, 'MANAGE_MEMBER')) {
    return { ok: false, error: 'UNAUTHORIZED: ต้องมีสิทธิ์ MANAGE_MEMBER' };
  }
  if (role === 'OWNER') return { ok: false, error: 'INVALID_ROLE: เชิญเป็น OWNER ไม่ได้' };
  if (memberOf(data, warehouseId, toShopId)) {
    return { ok: false, error: 'ALREADY_MEMBER: บัญชีนี้เป็นสมาชิกอยู่แล้ว' };
  }
  const dup = data.invitations.some(
    (i) => i.warehouseId === warehouseId && i.toShopId === toShopId && i.status === 'pending',
  );
  if (dup) return { ok: false, error: 'DUPLICATE_INVITATION: มีคำเชิญค้างอยู่แล้ว' };

  const invitation: WarehouseInvitation = {
    id: newId('inv', now),
    warehouseId,
    fromShopId: actorShopId,
    toShopId,
    role,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
  };
  return {
    ok: true,
    invitations: [...data.invitations, invitation],
    audit: [
      auditEntry(now, warehouseId, actorShopId, 'INVITE_SENT', `เชิญเป็น ${role}`, toShopId),
      ...data.audit,
    ],
  };
}

export function respondInvitation(
  data: WarehouseData,
  now: number,
  input: { invitationId: string; actorShopId: string; accept: boolean },
): CoreResult<{
  invitations: WarehouseInvitation[];
  members: WarehouseMember[];
  audit: WarehouseAuditEntry[];
}> {
  const invitation = data.invitations.find((i) => i.id === input.invitationId);
  if (!invitation || invitation.status !== 'pending') {
    return { ok: false, error: 'NOT_FOUND: ไม่พบคำเชิญที่ค้างอยู่' };
  }
  // Only the invited account may respond
  if (invitation.toShopId !== input.actorShopId) {
    return { ok: false, error: 'UNAUTHORIZED: ตอบได้เฉพาะบัญชีที่ถูกเชิญ' };
  }

  const status = input.accept ? 'accepted' : 'rejected';
  const invitations = data.invitations.map((i) =>
    i.id === invitation.id ? { ...i, status: status as typeof i.status, respondedAt: new Date(now).toISOString() } : i,
  );
  const members = input.accept
    ? [
        ...data.members,
        {
          warehouseId: invitation.warehouseId,
          shopId: invitation.toShopId,
          role: invitation.role,
          permissions: [...ROLE_PERMISSIONS[invitation.role]],
          addedAt: new Date(now).toISOString(),
          addedBy: invitation.fromShopId,
        },
      ]
    : data.members;

  return {
    ok: true,
    invitations,
    members,
    audit: [
      auditEntry(
        now,
        invitation.warehouseId,
        input.actorShopId,
        input.accept ? 'INVITE_ACCEPTED' : 'INVITE_REJECTED',
        input.accept ? `ตอบรับคำเชิญ (${invitation.role})` : 'ปฏิเสธคำเชิญ',
        invitation.toShopId,
      ),
      ...data.audit,
    ],
  };
}

// ---------------------------------------------------------------------------
// Access requests (outsider → Owner)
// ---------------------------------------------------------------------------

export function requestAccess(
  data: WarehouseData,
  now: number,
  input: { warehouseId: string; fromShopId: string; message?: string },
): CoreResult<{ requests: WarehouseAccessRequest[]; audit: WarehouseAuditEntry[] }> {
  const { warehouseId, fromShopId } = input;
  if (memberOf(data, warehouseId, fromShopId)) {
    return { ok: false, error: 'ALREADY_MEMBER: เข้าถึงคลังนี้ได้อยู่แล้ว' };
  }
  const dup = data.requests.some(
    (r) => r.warehouseId === warehouseId && r.fromShopId === fromShopId && r.status === 'pending',
  );
  if (dup) return { ok: false, error: 'DUPLICATE_REQUEST: ส่งคำขอไปแล้ว รอเจ้าของคลังตอบ' };

  const request: WarehouseAccessRequest = {
    id: newId('req', now),
    warehouseId,
    fromShopId,
    message: input.message,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
  };
  return {
    ok: true,
    requests: [...data.requests, request],
    audit: [
      auditEntry(now, warehouseId, fromShopId, 'REQUEST_SENT', input.message ?? 'ขอใช้คลังสินค้า'),
      ...data.audit,
    ],
  };
}

export function respondRequest(
  data: WarehouseData,
  now: number,
  input: { requestId: string; actorShopId: string; approve: boolean; role?: WarehouseRole },
): CoreResult<{
  requests: WarehouseAccessRequest[];
  members: WarehouseMember[];
  audit: WarehouseAuditEntry[];
}> {
  const request = data.requests.find((r) => r.id === input.requestId);
  if (!request || request.status !== 'pending') {
    return { ok: false, error: 'NOT_FOUND: ไม่พบคำขอที่ค้างอยู่' };
  }
  if (!hasPermission(data, request.warehouseId, input.actorShopId, 'MANAGE_MEMBER')) {
    return { ok: false, error: 'UNAUTHORIZED: ต้องมีสิทธิ์ MANAGE_MEMBER' };
  }

  const role = input.role ?? 'SELLER';
  const requests = data.requests.map((r) =>
    r.id === request.id
      ? {
          ...r,
          status: (input.approve ? 'approved' : 'rejected') as typeof r.status,
          respondedAt: new Date(now).toISOString(),
        }
      : r,
  );
  const members =
    input.approve && !memberOf(data, request.warehouseId, request.fromShopId)
      ? [
          ...data.members,
          {
            warehouseId: request.warehouseId,
            shopId: request.fromShopId,
            role,
            permissions: [...ROLE_PERMISSIONS[role]],
            addedAt: new Date(now).toISOString(),
            addedBy: input.actorShopId,
          },
        ]
      : data.members;

  return {
    ok: true,
    requests,
    members,
    audit: [
      auditEntry(
        now,
        request.warehouseId,
        input.actorShopId,
        input.approve ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
        input.approve ? `อนุมัติคำขอ (${role})` : 'ปฏิเสธคำขอ',
        request.fromShopId,
      ),
      ...data.audit,
    ],
  };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export function setMemberPermissions(
  data: WarehouseData,
  now: number,
  input: {
    warehouseId: string;
    actorShopId: string;
    targetShopId: string;
    role: WarehouseRole;
    permissions?: WarehousePermission[];
  },
): CoreResult<{ members: WarehouseMember[]; audit: WarehouseAuditEntry[] }> {
  const { warehouseId, actorShopId, targetShopId } = input;
  if (!hasPermission(data, warehouseId, actorShopId, 'MANAGE_MEMBER')) {
    return { ok: false, error: 'UNAUTHORIZED: ต้องมีสิทธิ์ MANAGE_MEMBER' };
  }
  if (isOwner(data, warehouseId, targetShopId)) {
    return { ok: false, error: 'INVALID: แก้สิทธิ์ OWNER ไม่ได้' };
  }
  const member = memberOf(data, warehouseId, targetShopId);
  if (!member) return { ok: false, error: 'NOT_FOUND: ไม่พบสมาชิก' };

  const permissions = input.permissions ?? [...ROLE_PERMISSIONS[input.role]];
  const members = data.members.map((m) =>
    m.warehouseId === warehouseId && m.shopId === targetShopId
      ? { ...m, role: input.role, permissions }
      : m,
  );
  return {
    ok: true,
    members,
    audit: [
      auditEntry(
        now,
        warehouseId,
        actorShopId,
        'PERMISSION_CHANGED',
        `เปลี่ยนเป็น ${input.role} · ${permissions.length} สิทธิ์`,
        targetShopId,
      ),
      ...data.audit,
    ],
  };
}

// ---------------------------------------------------------------------------
// Listings — install catalog to shop (bulk), never duplicating products
// ---------------------------------------------------------------------------

export function installListings(
  data: WarehouseData,
  now: number,
  input: {
    warehouseId: string;
    actorShopId: string;
    /** Shop that receives the listings (usually same as actor) */
    shopId: string;
    masterSkuIds: string[];
  },
): CoreResult<{ listings: Listing[]; audit: WarehouseAuditEntry[]; installedCount: number }> {
  const { warehouseId, actorShopId, shopId, masterSkuIds } = input;
  if (!hasPermission(data, warehouseId, actorShopId, 'CREATE_LISTING')) {
    return { ok: false, error: 'UNAUTHORIZED: ต้องมีสิทธิ์ CREATE_LISTING' };
  }

  // Duplicate-listing guard: skip products already listed for this shop
  const existing = new Set(
    data.listings
      .filter((l) => l.shopId === shopId && l.warehouseId === warehouseId)
      .map((l) => l.masterSkuId),
  );
  const fresh = [...new Set(masterSkuIds)].filter((id) => !existing.has(id));

  const listings: Listing[] = fresh.map((masterSkuId, i) => ({
    id: `lst-${now}-${i}`,
    shopId,
    warehouseId,
    masterSkuId,
    status: 'active',
    syncPolicy: 'MASTER_CONTROLLED',
    installedAt: new Date(now).toISOString(),
  }));

  return {
    ok: true,
    installedCount: listings.length,
    listings: [...data.listings, ...listings],
    audit: listings.length
      ? [
          auditEntry(
            now,
            warehouseId,
            actorShopId,
            'LISTINGS_INSTALLED',
            `ติดตั้ง ${listings.length} สินค้าเข้าร้าน`,
            shopId,
          ),
          ...data.audit,
        ]
      : data.audit,
  };
}

// ---------------------------------------------------------------------------
// Revoke access — disable listings, keep master products & history intact
// ---------------------------------------------------------------------------

export function revokeAccess(
  data: WarehouseData,
  now: number,
  input: { warehouseId: string; actorShopId: string; targetShopId: string },
): CoreResult<{
  members: WarehouseMember[];
  listings: Listing[];
  autoSync: AutoSyncSetting[];
  audit: WarehouseAuditEntry[];
}> {
  const { warehouseId, actorShopId, targetShopId } = input;
  if (!isOwner(data, warehouseId, actorShopId)) {
    return { ok: false, error: 'UNAUTHORIZED: ถอนสิทธิ์ได้เฉพาะ OWNER' };
  }
  if (isOwner(data, warehouseId, targetShopId)) {
    return { ok: false, error: 'INVALID: ถอนสิทธิ์ OWNER ไม่ได้' };
  }
  if (!memberOf(data, warehouseId, targetShopId)) {
    return { ok: false, error: 'NOT_FOUND: ไม่พบสมาชิก' };
  }

  const members = data.members.filter(
    (m) => !(m.warehouseId === warehouseId && m.shopId === targetShopId),
  );
  // Disable (never delete) — orders/history remain auditable
  const listings = data.listings.map((l) =>
    l.warehouseId === warehouseId && l.shopId === targetShopId && l.status === 'active'
      ? { ...l, status: 'disabled' as const, disabledReason: 'ถูกถอนสิทธิ์การใช้คลัง' }
      : l,
  );
  const autoSync = data.autoSync.filter(
    (a) => !(a.warehouseId === warehouseId && a.shopId === targetShopId),
  );

  return {
    ok: true,
    members,
    listings,
    autoSync,
    audit: [
      auditEntry(now, warehouseId, actorShopId, 'MEMBER_REVOKED', 'ถอนสิทธิ์ + ปิด Listing', targetShopId),
      ...data.audit,
    ],
  };
}

// ---------------------------------------------------------------------------
// Auto-sync new products to subscribed shops
// ---------------------------------------------------------------------------

export function applyAutoSyncForNewProduct(
  data: WarehouseData,
  now: number,
  input: { warehouseId: string; masterSkuId: string; categoryKey?: string },
): { listings: Listing[]; audit: WarehouseAuditEntry[]; createdFor: string[] } {
  const subscribers = data.autoSync.filter(
    (a) =>
      a.warehouseId === input.warehouseId &&
      a.enabled &&
      (!a.categoryKeys?.length || (input.categoryKey && a.categoryKeys.includes(input.categoryKey))),
  );

  let listings = data.listings;
  let audit = data.audit;
  const createdFor: string[] = [];

  for (const sub of subscribers) {
    // Subscriber must still hold CREATE_LISTING permission
    if (!hasPermission(data, input.warehouseId, sub.shopId, 'CREATE_LISTING')) continue;
    const result = installListings(
      { ...data, listings, audit },
      now,
      {
        warehouseId: input.warehouseId,
        actorShopId: sub.shopId,
        shopId: sub.shopId,
        masterSkuIds: [input.masterSkuId],
      },
    );
    if (result.ok && result.installedCount > 0) {
      listings = result.listings;
      audit = result.audit;
      createdFor.push(sub.shopId);
    }
  }
  return { listings, audit, createdFor };
}
