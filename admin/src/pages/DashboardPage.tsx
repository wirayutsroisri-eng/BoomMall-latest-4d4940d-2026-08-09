import { useCallback, useEffect, useState } from 'react';
import { OverviewPanel } from '../components/OverviewPanel';
import { TopUpReviewPanel } from '../components/TopUpReviewPanel';
import {
  fetchStats,
  fetchTopUps,
  type DashboardStats,
  type TopUpRow,
} from '../lib/api';

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topUps, setTopUps] = useState<TopUpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setBootError(null);
    try {
      const [s, t] = await Promise.all([fetchStats(), fetchTopUps()]);
      setStats(s.data);
      setTopUps(t.data);
    } catch (e) {
      setBootError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div className="space-y-10">
      {bootError ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {bootError}
        </div>
      ) : null}
      <OverviewPanel stats={stats} loading={loading} onRefresh={() => void refresh()} />
      <TopUpReviewPanel rows={topUps} loading={loading} onChanged={() => void refresh()} />
    </div>
  );
}
