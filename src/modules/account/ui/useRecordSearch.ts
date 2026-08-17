import { useEffect } from 'react';
import { recordActivity } from '@/modules/account/state/activity-store';

export function useRecordSearch(query: string, source: 'ผู้ใช้' | 'สินค้า' = 'ผู้ใช้') {
  useEffect(() => {
    if (source !== 'ผู้ใช้') return;
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      recordActivity({ category: 'search', title: q, subtitle: 'ผู้ใช้' });
    }, 800);
    return () => clearTimeout(timer);
  }, [query, source]);
}
