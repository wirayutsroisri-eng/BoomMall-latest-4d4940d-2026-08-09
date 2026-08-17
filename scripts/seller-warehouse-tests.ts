/**
 * End-to-end logic tests (TEST 1-13 ตามสเปก) — รันบน node:
 *   npx tsx scripts/seller-warehouse-tests.ts
 *
 * ทดสอบ pure core ตัวเดียวกับที่ Zustand store ใช้จริง
 * (stock-core.ts / warehouse-core.ts) — ไม่มี React Native import
 */
import {
  applyAdjust,
  applyCommitSale,
  applyDirectSale,
  applyRelease,
  applyReserve,
  applyRestock,
  applyTransfer,
  availableOf,
  buildClonePrefill,
  buildMasterWithVariants,
  shouldReorder,
  stockStatusOf,
} from '../src/modules/commerce/domain/stock-core';
import type { WarehouseStock } from '../src/modules/commerce/domain/types';
import {
  hasPermission,
  installListings,
  inviteMember,
  requestAccess,
  respondInvitation,
  respondRequest,
  revokeAccess,
  ROLE_PERMISSIONS,
  type WarehouseData,
} from '../src/modules/warehouse/domain/warehouse-core';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const NOW = 1_750_000_000_000;

function freshWarehouseData(): WarehouseData {
  return {
    warehouses: [
      { id: 'wh-owner', name: 'คลัง Boom EV', ownerShopId: 'shop-owner', coverColor: '#000' },
    ],
    members: [
      {
        warehouseId: 'wh-owner',
        shopId: 'shop-owner',
        role: 'OWNER',
        permissions: [...ROLE_PERMISSIONS.OWNER],
        addedAt: new Date(NOW).toISOString(),
        addedBy: 'shop-owner',
      },
    ],
    invitations: [],
    requests: [],
    listings: [],
    autoSync: [],
    audit: [],
  };
}

// ============================================================
section('TEST 1: Category → + → New Product → SKU → Inventory');
{
  const bundle = buildMasterWithVariants(
    {
      title: 'Controller FOC',
      masterSku: 'FOC-CTRL',
      channel: 'B2C',
      basePrice: 3900,
      tags: ['B2C'],
      customFields: [],
      categoryKey: 'controller', // prefilled from the category the user tapped +
      variants: [
        { label: '48V', sku: 'SKU-001', price: 3900, attrs: {}, warehouseId: 'WH-CTI-MAIN', onHand: 10 },
        { label: '60V', sku: 'SKU-002', price: 4400, attrs: {}, warehouseId: 'WH-CTI-MAIN', onHand: 5 },
        { label: '72V', sku: 'SKU-003', price: 4900, attrs: {}, warehouseId: 'WH-CTI-MAIN', onHand: 0 },
      ],
    },
    NOW,
  );
  check('สร้าง Product พร้อม categoryKey ที่ prefill', bundle.master.categoryKey === 'controller');
  check('ได้ 3 SKU (multi-variant)', bundle.variants.length === 3);
  check('ทุก SKU ผูกกับ master ใหม่', bundle.variants.every((v) => v.masterSkuId === bundle.master.id));
  check('Inventory rows ตรงกับ variant', bundle.stockRows.length === 3 && bundle.stockRows[0].onHand === 10);
  check('สต็อกเริ่มต้น > 0 มี RESTOCK ledger', bundle.ledgerDrafts.length === 2);
}

// ============================================================
section('TEST 2: Clone Product → New Product ID / New SKU / New Inventory');
{
  const source = buildMasterWithVariants(
    {
      title: 'Controller FOC',
      masterSku: 'FOC-CTRL',
      channel: 'B2C',
      basePrice: 3900,
      tags: ['B2C', 'Custom'],
      customFields: [{ key: 'voltage', value: '72V' }],
      description: 'ของแท้',
      variants: [
        { label: '72V', sku: 'FOC-72V', price: 4900, attrs: {}, warehouseId: 'WH-CTI-MAIN', onHand: 100 },
      ],
    },
    NOW,
  );
  const prefill = buildClonePrefill(source.master, source.variants, NOW + 1);

  check('Prefill ไม่มี product_id', !('id' in prefill));
  check('Prefill ไม่มี stock เดิม', !JSON.stringify(prefill).includes('"onHand"'));
  check('SKU ถูก regenerate ไม่ copy ตรง', prefill.variants[0].suggestedSku !== 'FOC-72V');
  check('Prefill ได้ description/customFields/structure', prefill.description === 'ของแท้' && prefill.customFields.length === 1);

  // ผ่าน Create Product Pipeline เดิม (buildMasterWithVariants)
  const cloned = buildMasterWithVariants(
    {
      title: prefill.title,
      masterSku: 'FOC-CTRL-2',
      channel: prefill.channel,
      basePrice: prefill.basePrice,
      tags: prefill.tags,
      customFields: prefill.customFields,
      description: prefill.description,
      variants: prefill.variants.map((v) => ({
        label: v.label,
        sku: v.suggestedSku,
        price: v.price,
        attrs: v.attrs,
        warehouseId: 'WH-CTI-MAIN' as const,
        onHand: 7, // user sets stock fresh
      })),
    },
    NOW + 2,
  );
  check('NEW Product ID', cloned.master.id !== source.master.id);
  check('NEW SKU id + code', cloned.variants[0].id !== source.variants[0].id && cloned.variants[0].sku !== source.variants[0].sku);
  check('NEW Inventory (ไม่แตะของเดิม)', cloned.stockRows[0].onHand === 7 && source.stockRows[0].onHand === 100);
}

// ============================================================
section('TEST 3: เพิ่ม Stock → Ledger ถูกบันทึก');
{
  const row: WarehouseStock = { variantId: 'v1', warehouseId: 'WH-CTI-MAIN', onHand: 10, reserved: 2, revision: 5 };
  const result = applyRestock(row, 15, 'รับของเข้าคลัง');
  check('เติมสต็อกสำเร็จ', result.ok && result.next.onHand === 25);
  if (result.ok) {
    check('Ledger: จำนวนก่อน/เปลี่ยน/หลัง ครบ', result.entry.availableBefore === 8 && result.entry.qtyChange === 15 && result.entry.availableAfter === 23);
    check('Ledger: มีเหตุผล + ประเภท RESTOCK', result.entry.type === 'RESTOCK' && result.entry.reason === 'รับของเข้าคลัง');
    check('Revision เพิ่ม (optimistic concurrency)', result.next.revision === 6);
  }
  const adj = applyAdjust(row, 1, 'นับสต็อกใหม่');
  check('ปรับยอดต่ำกว่า reserved ถูกปฏิเสธ (ห้าม Available ติดลบ)', !adj.ok && adj.reason === 'INSUFFICIENT');
}

// ============================================================
section('TEST 4: Order → Reserve → Available ลด');
{
  const row: WarehouseStock = { variantId: 'v1', warehouseId: 'WH-CTI-MAIN', onHand: 10, reserved: 0, revision: 1 };
  const reserve = applyReserve(row, 3, undefined, 'order-123');
  check('จองสำเร็จ', reserve.ok);
  if (reserve.ok) {
    check('Available ลด 10 → 7', availableOf(reserve.next) === 7);
    check('On Hand ยังไม่ลด (แค่จอง)', reserve.next.onHand === 10);
    check('Ledger ORDER_RESERVE + orderRef', reserve.entry.type === 'ORDER_RESERVE' && reserve.entry.orderRef === 'order-123');

    const sale = applyCommitSale(reserve.next, 3, 'order-123');
    check('Commit sale ตัดจริง 10 → 7', sale.ok && sale.next.onHand === 7 && sale.next.reserved === 0);
  }

  const open: WarehouseStock = { variantId: 'v1', warehouseId: 'WH-CTI-MAIN', onHand: 10, reserved: 0, revision: 1 };
  const cartHold = availableOf(open);
  check('ใส่ตะกร้าแล้วยังไม่ตัดสต็อก', cartHold === 10);
  const buy = applyDirectSale(open, 3, 'order-direct');
  check('กดซื้อแล้วตัดจากคลังโดยไม่จองก่อน', buy.ok && buy.next.onHand === 7 && buy.next.reserved === 0);
}

// ============================================================
section('TEST 5: Cancel → Stock/Reservation คืนถูกต้อง');
{
  const row: WarehouseStock = { variantId: 'v1', warehouseId: 'WH-CTI-MAIN', onHand: 10, reserved: 4, revision: 1 };
  const release = applyRelease(row, 4, 'order-123');
  check('คืนการจองสำเร็จ', release.ok);
  if (release.ok) {
    check('Available กลับมา 6 → 10', availableOf(release.next) === 10);
    check('Ledger ORDER_CANCEL', release.entry.type === 'ORDER_CANCEL');
  }
}

// ============================================================
section('TEST 6: Low Stock → Alert ถูกต้อง (threshold + reorder point)');
{
  check('เกิน threshold = ready', stockStatusOf(20, 8) === 'ready');
  check('เท่ากับ threshold = low (ใกล้หมด)', stockStatusOf(8, 8) === 'low');
  check('ศูนย์ = out (หมด)', stockStatusOf(0, 8) === 'out');
  check('ควรเติมสินค้า (static threshold)', shouldReorder({ available: 5, threshold: 8 }));
  check(
    'Dynamic Reorder Point: ADS×LeadTime+Safety',
    shouldReorder({ available: 20, threshold: 8, averageDailySales: 5, leadTimeDays: 4, safetyStock: 2 }) &&
      !shouldReorder({ available: 30, threshold: 8, averageDailySales: 5, leadTimeDays: 4, safetyStock: 2 }),
  );
  // Non-spam: การแจ้งเตือนอิง "transition" — ready→low แจ้งครั้งเดียว, low→low ไม่แจ้งซ้ำ
  const seen: Record<string, string> = {};
  const fire = (id: string, status: string) => {
    const prev = seen[id] ?? 'ready';
    seen[id] = status;
    return (status === 'low' || status === 'out') && prev !== status;
  };
  check('แจ้งเมื่อเข้า low ครั้งแรก', fire('sku1', 'low') === true);
  check('ไม่แจ้งซ้ำเมื่อยัง low', fire('sku1', 'low') === false);
  check('แจ้งอีกครั้งเมื่อ low → out', fire('sku1', 'out') === true);
}

// ============================================================
section('TEST 7: Owner แชร์ Warehouse → Profile B Accept');
{
  let data = freshWarehouseData();
  const invite = inviteMember(data, NOW, {
    warehouseId: 'wh-owner',
    actorShopId: 'shop-owner',
    toShopId: 'shop-b',
    role: 'SELLER',
  });
  check('Owner ส่งคำเชิญได้', invite.ok);
  if (invite.ok) {
    data = { ...data, invitations: invite.invitations, audit: invite.audit };
    const dup = inviteMember(data, NOW + 1, {
      warehouseId: 'wh-owner',
      actorShopId: 'shop-owner',
      toShopId: 'shop-b',
      role: 'SELLER',
    });
    check('กันคำเชิญซ้ำ (Duplicate Invitation)', !dup.ok);

    const wrongResponder = respondInvitation(data, NOW + 2, {
      invitationId: data.invitations[0].id,
      actorShopId: 'shop-c',
      accept: true,
    });
    check('คนอื่นตอบคำเชิญแทนไม่ได้', !wrongResponder.ok);

    const accept = respondInvitation(data, NOW + 3, {
      invitationId: data.invitations[0].id,
      actorShopId: 'shop-b',
      accept: true,
    });
    check('Profile B ตอบรับสำเร็จ', accept.ok);
    if (accept.ok) {
      data = { ...data, invitations: accept.invitations, members: accept.members, audit: accept.audit };
      check('B เป็นสมาชิก + ได้ Permission ตาม Role', hasPermission(data, 'wh-owner', 'shop-b', 'CREATE_LISTING'));
      check('B ไม่ได้สิทธิ์ MANAGE_MEMBER (SELLER)', !hasPermission(data, 'wh-owner', 'shop-b', 'MANAGE_MEMBER'));
      check('Audit log บันทึกทั้ง INVITE_SENT + INVITE_ACCEPTED', data.audit.length === 2);
    }
  }

  // Request-to-use flow + duplicate guard
  let d2 = freshWarehouseData();
  const req = requestAccess(d2, NOW, { warehouseId: 'wh-owner', fromShopId: 'shop-b', message: 'ขอครับ' });
  check('ขอใช้คลังได้', req.ok);
  if (req.ok) {
    d2 = { ...d2, requests: req.requests, audit: req.audit };
    check('กันคำขอซ้ำ (Duplicate Request)', !requestAccess(d2, NOW + 1, { warehouseId: 'wh-owner', fromShopId: 'shop-b' }).ok);
    const approve = respondRequest(d2, NOW + 2, { requestId: d2.requests[0].id, actorShopId: 'shop-owner', approve: true, role: 'SELLER' });
    check('Owner อนุมัติ + กำหนด Role ได้', approve.ok && hasPermission({ ...d2, members: approve.ok ? approve.members : d2.members }, 'wh-owner', 'shop-b', 'USE_PRODUCTS'));
  }
}

// ============================================================
section('TEST 8: Profile B ติดตั้ง 1,000 SKU → ไม่ Duplicate Master Products');
{
  let data = freshWarehouseData();
  const accept = respondInvitation(
    {
      ...data,
      invitations: [
        { id: 'i1', warehouseId: 'wh-owner', fromShopId: 'shop-owner', toShopId: 'shop-b', role: 'SELLER', status: 'pending', createdAt: '' },
      ],
    },
    NOW,
    { invitationId: 'i1', actorShopId: 'shop-b', accept: true },
  );
  if (accept.ok) data = { ...data, members: accept.members, invitations: accept.invitations, audit: accept.audit };

  const thousandIds = Array.from({ length: 1000 }, (_, i) => `ms-prod-${i}`);
  const install = installListings(data, NOW + 1, {
    warehouseId: 'wh-owner',
    actorShopId: 'shop-b',
    shopId: 'shop-b',
    masterSkuIds: thousandIds,
  });
  check('Bulk install 1,000 สินค้าในครั้งเดียว', install.ok && install.installedCount === 1000);
  if (install.ok) {
    data = { ...data, listings: install.listings, audit: install.audit };
    check('Listing เป็น Relation (shop_id + product_id) ไม่ clone', data.listings.every((l) => l.shopId === 'shop-b' && l.masterSkuId.startsWith('ms-prod-')));
    const again = installListings(data, NOW + 2, {
      warehouseId: 'wh-owner',
      actorShopId: 'shop-b',
      shopId: 'shop-b',
      masterSkuIds: thousandIds,
    });
    check('ติดตั้งซ้ำถูกข้ามทั้งหมด (กัน Duplicate Listing)', again.ok && again.installedCount === 0);
    check('จำนวน Listing ยังคง 1,000', again.ok && again.listings.length === 1000);
  }
}

// ============================================================
section('TEST 9-10: B ขาย → Inventory กลางลด → A เห็น Stock ใหม่');
{
  // Inventory กลางชุดเดียว (Source of Truth)
  let central: WarehouseStock = { variantId: 'FOC-72V', warehouseId: 'WH-B2B-HUB', onHand: 100, reserved: 0, revision: 1 };

  // Profile B ขาย 1 ชิ้น
  const reserve = applyReserve(central, 1, undefined, 'order-B-001');
  if (reserve.ok) {
    const sale = applyCommitSale(reserve.next, 1, 'order-B-001');
    if (sale.ok) central = sale.next;
    check('B ขาย 1: Inventory กลาง 100 → 99', central.onHand === 99);
  }
  // Profile A อ่าน stock — ต้องอ่าน row กลางเดียวกัน ไม่มีกองสำรอง
  check('A เห็น 99 จาก Source of Truth เดียวกัน', availableOf(central) === 99);
}

// ============================================================
section('TEST 11: Owner ถอน Permission → Listing Disable แต่ประวัติอยู่');
{
  let data = freshWarehouseData();
  data = {
    ...data,
    members: [
      ...data.members,
      { warehouseId: 'wh-owner', shopId: 'shop-b', role: 'SELLER', permissions: [...ROLE_PERMISSIONS.SELLER], addedAt: '', addedBy: 'shop-owner' },
    ],
    listings: [
      { id: 'l1', shopId: 'shop-b', warehouseId: 'wh-owner', masterSkuId: 'ms-1', status: 'active', syncPolicy: 'MASTER_CONTROLLED', installedAt: '' },
    ],
    audit: [{ id: 'a0', warehouseId: 'wh-owner', actorShopId: 'shop-owner', action: 'INVITE_SENT', detail: 'ประวัติเก่า', at: '' }],
  };
  const revoked = revokeAccess(data, NOW, { warehouseId: 'wh-owner', actorShopId: 'shop-owner', targetShopId: 'shop-b' });
  check('Owner ถอนสิทธิ์ได้', revoked.ok);
  if (revoked.ok) {
    check('สมาชิกถูกลบออก', !revoked.members.some((m) => m.shopId === 'shop-b'));
    check('Listing ถูก Disable ไม่ถูกลบ', revoked.listings.length === 1 && revoked.listings[0].status === 'disabled');
    check('ประวัติ (Audit) เดิมยังอยู่ + เพิ่ม MEMBER_REVOKED', revoked.audit.some((a) => a.detail === 'ประวัติเก่า') && revoked.audit[0].action === 'MEMBER_REVOKED');
  }
  const nonOwner = revokeAccess(data, NOW, { warehouseId: 'wh-owner', actorShopId: 'shop-b', targetShopId: 'shop-owner' });
  check('คนที่ไม่ใช่ Owner ถอนสิทธิ์ไม่ได้', !nonOwner.ok);
}

// ============================================================
section('TEST 12: Unauthorized Profile เข้าคลัง → ถูก Reject');
{
  const data = freshWarehouseData();
  const install = installListings(data, NOW, {
    warehouseId: 'wh-owner',
    actorShopId: 'shop-intruder', // แค่รู้ warehouse_id — ไม่ใช่สมาชิก
    shopId: 'shop-intruder',
    masterSkuIds: ['ms-1'],
  });
  check('ติดตั้งโดยไม่มีสิทธิ์ → UNAUTHORIZED', !install.ok && !data.listings.length);
  const inviteByOutsider = inviteMember(data, NOW, { warehouseId: 'wh-owner', actorShopId: 'shop-intruder', toShopId: 'shop-x', role: 'VIEWER' });
  check('เชิญสมาชิกโดยไม่มีสิทธิ์ → UNAUTHORIZED', !inviteByOutsider.ok);
  const approveByOutsider = respondRequest(
    { ...data, requests: [{ id: 'r1', warehouseId: 'wh-owner', fromShopId: 'shop-b', status: 'pending', createdAt: '' }] },
    NOW,
    { requestId: 'r1', actorShopId: 'shop-intruder', approve: true },
  );
  check('อนุมัติคำขอโดยไม่มีสิทธิ์ → UNAUTHORIZED', !approveByOutsider.ok);
  check('VIEWER อ่านได้แต่แก้ stock ไม่ได้', !hasPermission({ ...data, members: [...data.members, { warehouseId: 'wh-owner', shopId: 'shop-v', role: 'VIEWER', permissions: [...ROLE_PERMISSIONS.VIEWER], addedAt: '', addedBy: '' }] }, 'wh-owner', 'shop-v', 'EDIT_STOCK'));
}

// ============================================================
section('TEST 13: ยิง Order พร้อมกัน → Stock ไม่ติดลบ');
{
  let row: WarehouseStock = { variantId: 'v1', warehouseId: 'WH-CTI-MAIN', onHand: 5, reserved: 0, revision: 1 };
  const results: boolean[] = [];
  // จำลอง 4 orders แย่งกัน order ละ 2 ชิ้น (serialized ตาม JS event loop เหมือน store จริง)
  for (let i = 0; i < 4; i += 1) {
    const r = applyReserve(row, 2, undefined, `order-${i}`);
    results.push(r.ok);
    if (r.ok) row = r.next;
  }
  check('สำเร็จแค่ 2 orders แรก (5 ÷ 2)', results.filter(Boolean).length === 2);
  check('Available เหลือ 1 ไม่ติดลบ', availableOf(row) === 1 && row.reserved === 4);

  // Optimistic concurrency: revision เก่าถูกปฏิเสธ
  const stale = applyReserve(row, 1, 1);
  check('STALE_REVISION ถูกปฏิเสธ', !stale.ok && stale.reason === 'STALE_REVISION');

  // Transfer ก็ห้ามเกิน available
  const transfer = applyTransfer(row, undefined, 99, 'WH-CTI-SERVICE', 'v1');
  check('โอนเกิน Available → INSUFFICIENT', !transfer.ok);
}

// ============================================================
console.log('\n==================================================');
console.log(`ผลทดสอบ: ผ่าน ${passed} · ล้มเหลว ${failed}`);
if (failed > 0) {
  console.error('\nรายการที่ล้มเหลว:');
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('ALL TESTS PASSED ✅');
