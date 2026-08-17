import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ShopCategory = {
  key: string;
  label: string;
  builtin: boolean;
  hidden?: boolean;
};

/** Built-in categories keep stable keys — product matching relies on them */
export const BASE_CATEGORIES: ShopCategory[] = [
  { key: 'motor', label: 'มอเตอร์', builtin: true },
  { key: 'controller', label: 'กล่องควบคุม', builtin: true },
  { key: 'battery', label: 'แบตเตอรี่', builtin: true },
  { key: 'brakes', label: 'ชุดเบรก', builtin: true },
  { key: 'cables', label: 'สายไฟ', builtin: true },
  { key: 'parts', label: 'อะไหล่', builtin: true },
  { key: 'apparel', label: 'เสื้อผ้า', builtin: true },
  { key: 'bag', label: 'กระเป๋า', builtin: true },
  { key: 'custom', label: 'งานสั่งทำ / Custom', builtin: true },
];

type CategoriesState = {
  categories: ShopCategory[];
  addCategory: (label: string) => { ok: boolean; key?: string; message: string };
  renameCategory: (key: string, label: string) => void;
  toggleHidden: (key: string) => void;
  moveCategory: (key: string, direction: -1 | 1) => void;
  removeCategory: (key: string) => void;
};

export const useCategoriesStore = create<CategoriesState>()(
  persist(
    (set, get) => ({
      categories: BASE_CATEGORIES,

      addCategory: (label) => {
        const name = label.trim();
        if (!name) return { ok: false, message: 'กรุณาตั้งชื่อหมวดหมู่' };
        const exists = get().categories.some(
          (c) => c.label.toLowerCase() === name.toLowerCase(),
        );
        if (exists) return { ok: false, message: `"${name}" ถูกสร้างไว้แล้ว` };
        const key = `user:${name}`;
        set((s) => ({
          categories: [...s.categories, { key, label: name, builtin: false }],
        }));
        return { ok: true, key, message: 'สร้างหมวดหมู่แล้ว' };
      },

      renameCategory: (key, label) => {
        const name = label.trim();
        if (!name) return;
        set((s) => ({
          categories: s.categories.map((c) =>
            c.key === key && !c.builtin ? { ...c, label: name } : c,
          ),
        }));
      },

      toggleHidden: (key) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.key === key ? { ...c, hidden: !c.hidden } : c,
          ),
        })),

      moveCategory: (key, direction) =>
        set((s) => {
          const index = s.categories.findIndex((c) => c.key === key);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= s.categories.length) return s;
          const next = [...s.categories];
          [next[index], next[target]] = [next[target], next[index]];
          return { categories: next };
        }),

      removeCategory: (key) =>
        set((s) => ({
          categories: s.categories.filter((c) => c.key !== key || c.builtin),
        })),
    }),
    {
      name: 'boommall-shop-categories',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<CategoriesState, 'categories'>>;
        if (!saved.categories) return current;
        // Keep saved order/flags; append any new built-ins added in code later
        const savedKeys = new Set(saved.categories.map((c) => c.key));
        return {
          ...current,
          categories: [
            ...saved.categories,
            ...BASE_CATEGORIES.filter((c) => !savedKeys.has(c.key)),
          ],
        };
      },
    },
  ),
);
