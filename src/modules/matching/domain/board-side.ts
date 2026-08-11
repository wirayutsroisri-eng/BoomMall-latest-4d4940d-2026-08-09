import type { BoardSide, FeedItem } from '@/modules/feed/domain/types';
import type { JobCategory } from './types';
import { extractJobKeywords } from './extract-keywords';

const DEMAND_HINTS = ['หาคน', 'หาช่าง', 'ขอช่าง', 'อยากได้', 'ต้องการ', 'ช่วยด้วย', 'ด่วน'];
const SUPPLY_HINTS = ['รับงาน', 'รับตัด', 'รับจ้าง', 'เสนอบริการ', 'รับซ่อม', 'รับล้าง', 'พร้อมบริการ'];

/** Infer marketplace side from caption when boardSide is missing. */
export function inferBoardSide(caption: string, tags: string[] = []): BoardSide {
  const text = `${caption} ${tags.join(' ')}`.toLowerCase();
  if (SUPPLY_HINTS.some((h) => text.includes(h.toLowerCase()))) return 'supply';
  if (DEMAND_HINTS.some((h) => text.includes(h.toLowerCase()))) return 'demand';
  return 'demand';
}

export function resolveBoardSide(item: FeedItem): BoardSide {
  if (item.boardSide) return item.boardSide;
  return inferBoardSide(item.caption, item.product?.tags ?? []);
}

export function boardCategoryLabel(item: FeedItem): string {
  const skills = extractJobKeywords(item.caption).skills;
  if (skills[0]) return skills[0];
  return item.product.tags.find((t) => t !== 'เว็บบอร์ด' && t !== 'บริการ') ?? 'บริการ';
}

export function boardTitlePrefix(side: BoardSide): string {
  return side === 'supply' ? '🛠️' : '📌';
}

export function formatBoardBudget(price: number): string | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  return `💰 ${Math.trunc(price).toLocaleString('en-US')} บ.`;
}

export function categoryGlyph(category?: JobCategory | string): string {
  switch (category) {
    case 'Garden/Handyman':
      return '🌿';
    case 'Electrician':
      return '⚡';
    case 'EV/Mechanic':
      return '🛵';
    case 'HVAC':
      return '❄️';
    default:
      return '🔧';
  }
}
