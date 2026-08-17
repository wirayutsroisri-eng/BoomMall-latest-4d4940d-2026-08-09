import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { SummaryCard } from '../components/SummaryCard';
import { fetchCommerceAnalytics, type AnalyticsSummary } from '../lib/api';

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCommerceAnalytics(24);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดสถิติไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="วิเคราะห์"
        title="ติดตามอีเวนต์"
        description="เหตุการณ์ 24 ชั่วโมงล่าสุดจากแอปและหลังบ้าน — view, catalog, order, purchase"
      />
      {error ? (
        <div className="mb-6 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <SummaryCard title="อีเวนต์ทั้งหมด" value={loading ? '—' : String(data?.total ?? 0)} subtitle="24 ชม." />
        <SummaryCard
          title="ประเภท"
          value={loading ? '—' : String(data?.byName.length ?? 0)}
          subtitle="ชนิดอีเวนต์"
        />
        <SummaryCard
          title="ล่าสุด"
          value={loading ? '—' : data?.recent[0]?.name ?? '—'}
          subtitle={data?.recent[0] ? new Date(data.recent[0].createdAt).toLocaleTimeString('th-TH') : ''}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-panel overflow-hidden">
          <p className="border-b border-[var(--line)] px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
            ตามชื่อเหตุการณ์
          </p>
          <ul className="divide-y divide-[var(--line)]">
            {(data?.byName ?? []).map((row) => (
              <li key={row.name} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-semibold">{row.name}</span>
                <span className="text-[var(--ink-secondary)]">{row.count}</span>
              </li>
            ))}
            {!loading && !data?.byName.length ? (
              <li className="px-4 py-6 text-sm text-[var(--ink-secondary)]">ยังไม่มีอีเวนต์</li>
            ) : null}
          </ul>
        </div>
        <div className="surface-panel overflow-hidden">
          <p className="border-b border-[var(--line)] px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
            รายการล่าสุด
          </p>
          <ul className="divide-y divide-[var(--line)]">
            {(data?.recent ?? []).map((row) => (
              <li key={row.id} className="px-4 py-3 text-sm">
                <p className="font-semibold">{row.name}</p>
                <p className="text-xs text-[var(--ink-tertiary)]">
                  {row.entityType ?? '—'} {row.entityId ?? ''} ·{' '}
                  {new Date(row.createdAt).toLocaleString('th-TH')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
