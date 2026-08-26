import type { CustomFieldDef, Warehouse } from '../domain/types';

export const WAREHOUSES: Warehouse[] = [
  {
    id: 'PRIMARY',
    name: 'คลังหลัก',
    city: '',
    channelFocus: ['B2C', 'B2B', 'C2C'],
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
  void masterId;
  return '';
}
