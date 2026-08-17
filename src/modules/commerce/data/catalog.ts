import type {
  CustomFieldDef,
  MasterSku,
  SkuVariant,
  Warehouse,
  WarehouseStock,
} from '../domain/types';

export const WAREHOUSES: Warehouse[] = [
  {
    id: 'WH-CTI-MAIN',
    name: 'Boom EV Main — จันทบุรี',
    city: 'Chanthaburi',
    channelFocus: ['B2C', 'C2C'],
  },
  {
    id: 'WH-CTI-SERVICE',
    name: 'Service Bay Stock',
    city: 'Chanthaburi',
    channelFocus: ['B2C'],
  },
  {
    id: 'WH-B2B-HUB',
    name: 'B2B Fleet Hub',
    city: 'Chanthaburi',
    channelFocus: ['B2B'],
  },
  {
    id: 'WH-C2C-LOCKER',
    name: 'C2C Secure Locker',
    city: 'Chanthaburi',
    channelFocus: ['C2C'],
  },
];

export const DEFAULT_CUSTOM_FIELDS: CustomFieldDef[] = [
  { key: 'voltage', label: 'แรงดัน', type: 'text' },
  { key: 'capacityAh', label: 'ความจุ (Ah)', type: 'text' },
  { key: 'warrantyMonths', label: 'รับประกัน', type: 'text' },
  { key: 'material', label: 'วัสดุ', type: 'text' },
];

/** Portrait content image for shop-dashboard product columns. */
export function masterContentImage(masterId: string) {
  return `https://picsum.photos/seed/boom-shop-${masterId}/720/960`;
}

/** Demo catalog disabled — shop starts empty for real product entry.
 *  Restore sample data from `./catalog.demo` if needed for QA.
 */
export const seedMasterSkus: MasterSku[] = [];
export const externalMasterSkus: MasterSku[] = [];
export const seedVariants: SkuVariant[] = [];
export const externalVariants: SkuVariant[] = [];
export const seedWarehouseStock: WarehouseStock[] = [];
export const externalWarehouseStock: WarehouseStock[] = [];
