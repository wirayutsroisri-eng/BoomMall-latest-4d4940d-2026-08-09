import type { JobCategory } from './types';

/** Thai job keyword → category map for Community Board matching. */
export const SKILL_KEYWORD_MAP: Record<string, JobCategory> = {
  ตัดหญ้า: 'Garden/Handyman',
  ตัดแต่งกอไผ่: 'Garden/Handyman',
  ตัดกอไผ่: 'Garden/Handyman',
  ทำสวน: 'Garden/Handyman',
  ตัดต้นไม้: 'Garden/Handyman',
  ซ่อมไฟ: 'Electrician',
  ไฟรั่ว: 'Electrician',
  เดินสายไฟ: 'Electrician',
  ซ่อมมอเตอร์ไซค์: 'EV/Mechanic',
  แบตเตอรี่: 'EV/Mechanic',
  EV: 'EV/Mechanic',
  ล้างแอร์: 'HVAC',
  แอร์ไม่เย็น: 'HVAC',
};

/** Longer phrases first so "ตัดกอไผ่" wins over shorter overlaps if any. */
export const SKILL_KEYWORDS = Object.keys(SKILL_KEYWORD_MAP).sort(
  (a, b) => b.length - a.length,
);
