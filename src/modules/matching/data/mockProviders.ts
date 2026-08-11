import { CHANTHABURI, offsetKm } from '../domain/geo';
import type { ServiceProvider } from '../domain/types';

/**
 * Mock providers around Chanthaburi at ~3 / 8 / 18 / 35 km bands
 * so radius chips (3–50 km / All Area) are easy to verify.
 */
export const MOCK_PROVIDERS: ServiceProvider[] = [
  // ~3 km — near-town garden
  {
    id: 'prov-gardener-3',
    name: 'ลุงสม ตัดกอไผ่',
    handle: 'som.bamboo',
    avatarColor: '#1A7A55',
    skills: ['ตัดกอไผ่', 'ตัดแต่งกอไผ่', 'ตัดหญ้า', 'ทำสวน'],
    categories: ['Garden/Handyman'],
    gps: offsetKm(CHANTHABURI, 2.4, 1.2),
    isActive: true,
  },
  // ~4 km — electrician
  {
    id: 'prov-electrician-4',
    name: 'ช่างไฟฟ้าเมืองจันท์',
    handle: 'chan.electric',
    avatarColor: '#F5A524',
    skills: ['ซ่อมไฟ', 'ไฟรั่ว', 'เดินสายไฟ'],
    categories: ['Electrician'],
    gps: offsetKm(CHANTHABURI, 1.5, -3.5),
    isActive: true,
  },
  // ~6 km — HVAC
  {
    id: 'prov-hvac-6',
    name: 'ล้างแอร์ใกล้บ้าน',
    handle: 'air.cool.chan',
    avatarColor: '#00A86B',
    skills: ['ล้างแอร์', 'แอร์ไม่เย็น'],
    categories: ['HVAC'],
    gps: offsetKm(CHANTHABURI, 4.0, 4.0),
    isActive: true,
  },
  // ~8 km — garden / handyman (outside 3–5 km chips)
  {
    id: 'prov-handyman-8',
    name: 'ช่างไม้บ้านสวน',
    handle: 'ban.suwan',
    avatarColor: '#2E8CFF',
    skills: ['ตัดต้นไม้', 'ทำสวน', 'ตัดกอไผ่', 'ตัดแต่งกอไผ่', 'ตัดหญ้า'],
    categories: ['Garden/Handyman'],
    gps: offsetKm(CHANTHABURI, -5.5, 5.5),
    isActive: true,
  },
  // ~8 km — EV
  {
    id: 'prov-ev-8',
    name: 'อู่ EV จันทบุรี',
    handle: 'ev.chanthaburi',
    avatarColor: '#FE2C55',
    skills: ['ซ่อมมอเตอร์ไซค์', 'แบตเตอรี่', 'EV'],
    categories: ['EV/Mechanic'],
    gps: offsetKm(CHANTHABURI, -5.0, -6.0),
    isActive: true,
  },
  // ~18 km — regional garden (needs 25+ or All Area)
  {
    id: 'prov-gardener-18',
    name: 'ทีมสวนอำเภอท่าใหม่',
    handle: 'thamai.garden',
    avatarColor: '#0B6E4F',
    skills: ['ตัดกอไผ่', 'ตัดแต่งกอไผ่', 'ตัดหญ้า', 'ทำสวน', 'ตัดต้นไม้'],
    categories: ['Garden/Handyman'],
    gps: offsetKm(CHANTHABURI, 12.0, 13.0),
    isActive: true,
  },
  // ~18 km — regional electrician
  {
    id: 'prov-electric-18',
    name: 'ไฟบ้านขลุง',
    handle: 'khlung.wire',
    avatarColor: '#C9A227',
    skills: ['ซ่อมไฟ', 'ไฟรั่ว', 'เดินสายไฟ'],
    categories: ['Electrician'],
    gps: offsetKm(CHANTHABURI, -10.0, 15.0),
    isActive: true,
  },
  // ~35 km — distant garden (needs 50 km or All Area)
  {
    id: 'prov-gardener-35',
    name: 'รับตัดต้นไม้มะขามจุ้ง',
    handle: 'makham.trees',
    avatarColor: '#3D5A80',
    skills: ['ตัดกอไผ่', 'ตัดแต่งกอไผ่', 'ตัดต้นไม้', 'ทำสวน'],
    categories: ['Garden/Handyman'],
    gps: offsetKm(CHANTHABURI, 25.0, 24.0),
    isActive: true,
  },
  // ~35 km — distant EV
  {
    id: 'prov-ev-35',
    name: 'อู่แบตตราด-จันท์',
    handle: 'trat.ev.battery',
    avatarColor: '#9B2226',
    skills: ['ซ่อมมอเตอร์ไซค์', 'แบตเตอรี่', 'EV'],
    categories: ['EV/Mechanic'],
    gps: offsetKm(CHANTHABURI, -22.0, -27.0),
    isActive: true,
  },
  {
    id: 'prov-inactive',
    name: 'ช่างพักรับงาน (ปิดสวิตช์)',
    handle: 'offline.tech',
    avatarColor: '#888888',
    skills: ['ตัดกอไผ่', 'ตัดหญ้า', 'ทำสวน'],
    categories: ['Garden/Handyman'],
    gps: offsetKm(CHANTHABURI, 1.0, 1.0),
    isActive: false,
  },
];
