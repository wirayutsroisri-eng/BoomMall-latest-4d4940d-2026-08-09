import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { VaultItem, VehicleRecord } from '../domain/types';

const PASSCODE_KEY = 'boommall.vault.passcode';

type VaultState = {
  unlocked: boolean;
  hasPasscode: boolean;
  items: VaultItem[];
  vehicles: VehicleRecord[];
  hydrate: () => Promise<void>;
  setPasscode: (code: string) => Promise<void>;
  unlockWithPasscode: (code: string) => Promise<boolean>;
  unlock: () => void;
  lock: () => void;
  addItem: (item: Omit<VaultItem, 'id' | 'updatedAt'> & { id?: string }) => void;
  removeItemByRef: (refId: string) => void;
  isSaved: (refId: string) => boolean;
};

const seedItems: VaultItem[] = [
  {
    id: 'v-1',
    kind: 'receipt',
    title: 'ใบเสร็จรับประกัน — แบต 60V 32Ah',
    subtitle: 'รับประกันถึง ส.ค. 2029',
    updatedAt: 'วันนี้',
  },
  {
    id: 'v-2',
    kind: 'note',
    title: 'รหัสตู้เครื่องมือร้าน',
    subtitle: 'บันทึกความลับ Offline-First',
    updatedAt: 'เมื่อวาน',
  },
  {
    id: 'v-3',
    kind: 'hidden-chat',
    title: 'ห้องแชตซ่อน — ดีล B2B',
    subtitle: '3 ข้อความที่ยังไม่อ่าน',
    updatedAt: 'ซ่อน',
  },
  {
    id: 'v-4',
    kind: 'photo',
    title: 'รูปสเปกแบตก่อนติดตั้ง',
    subtitle: 'เก็บในเครื่องเท่านั้น',
    updatedAt: '3 วันก่อน',
  },
  {
    id: 'v-5',
    kind: 'diagram',
    title: 'ไดอะแกรมวงจรไฟ Wave→EV',
    subtitle: 'Fuse 80A · Contactor · Controller pinout',
    updatedAt: 'ออฟไลน์',
  },
];

const seedVehicles: VehicleRecord[] = [
  {
    id: 'veh-1',
    model: 'Honda Wave 125i → EV Convert',
    plate: 'กข 4521 จันทบุรี',
    batterySpec: '60V 32Ah LiFePO4 + BMS 16S',
    lastService: '2 สัปดาห์ก่อน',
    notes: 'เปลี่ยนคอนโทรลเลอร์ 2000W / ปรับโช้ค 340mm',
  },
  {
    id: 'veh-2',
    model: 'Boom Scooter X1',
    plate: 'ขน 8890 จันทบุรี',
    batterySpec: '48V 30Ah Fleet Pack',
    lastService: '1 เดือนก่อน',
    notes: 'ตรวจเซลล์บาลานซ์ปกติ / เติมน้ำกลั่นห้าม',
  },
];

export const useVaultStore = create<VaultState>((set, get) => ({
  unlocked: false,
  hasPasscode: false,
  items: seedItems,
  vehicles: seedVehicles,
  hydrate: async () => {
    const existing = await SecureStore.getItemAsync(PASSCODE_KEY);
    set({ hasPasscode: Boolean(existing) });
  },
  setPasscode: async (code) => {
    await SecureStore.setItemAsync(PASSCODE_KEY, code);
    set({ hasPasscode: true, unlocked: true });
  },
  unlockWithPasscode: async (code) => {
    const stored = await SecureStore.getItemAsync(PASSCODE_KEY);
    if (stored === code) {
      set({ unlocked: true });
      return true;
    }
    return false;
  },
  unlock: () => set({ unlocked: true }),
  lock: () => set({ unlocked: false }),
  addItem: (item) =>
    set((state) => ({
      items: [
        {
          ...item,
          id: item.id ?? `v-${Date.now()}`,
          updatedAt: 'เมื่อสักครู่',
        },
        ...state.items,
      ],
    })),
  removeItemByRef: (refId) =>
    set((state) => ({ items: state.items.filter((i) => i.refId !== refId) })),
  isSaved: (refId) => get().items.some((i) => i.refId === refId),
}));
