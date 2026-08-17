import { useActivityStore } from '@/modules/account/state/activity-store';

/** เอาประวัติซื้อ/ดู/ค้นหาที่เคยปนในบัญชีผู้ใช้ออก — โมดูลร้านไม่เก็บของฝั่งลูกค้า */
export function migrateShopActivityFromUserStore() {
  if (!useActivityStore.persist.hasHydrated()) return;
  useActivityStore.getState().dropShopDomainEntries();
}
