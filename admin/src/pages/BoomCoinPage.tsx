import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { fetchStats, type DashboardStats } from '../lib/api';

function fmt(n: string | number | undefined) {
  if (n == null) return '—';
  try {
    return typeof n === 'number' ? n.toLocaleString('th-TH') : BigInt(n).toLocaleString('th-TH');
  } catch {
    return String(n);
  }
}

export function BoomCoinPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats((await fetchStats()).data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดยอดเหรียญไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader
        eyebrow="การเงิน"
        title="Boom Coin"
        description="ตรวจยอดเหรียญจากบัญชีระบบจริง — หน้านี้ไม่อนุญาตให้ปรับยอดโดยไม่มีบันทึก และไม่จำลองการเติมเงิน"
        helpKey="boomCoin"
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {!stats ? (
        <p className="text-sm text-[var(--ink-secondary)]">กำลังโหลด…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="surface-panel p-5">
            <p className="text-xs font-bold text-[var(--ink-tertiary)]">เหรียญที่ออกแล้ว</p>
            <p className="font-display mt-2 text-2xl font-extrabold">{fmt(stats.totalMintedSupply)}</p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-xs font-bold text-[var(--ink-tertiary)]">หมุนเวียน</p>
            <p className="font-display mt-2 text-2xl font-extrabold">{fmt(stats.circulatingSupply)}</p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-xs font-bold text-[var(--ink-tertiary)]">ยอดผู้ใช้</p>
            <p className="font-display mt-2 text-2xl font-extrabold">{fmt(stats.userBalance)}</p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-xs font-bold text-[var(--ink-tertiary)]">ยอดร้าน</p>
            <p className="font-display mt-2 text-2xl font-extrabold">{fmt(stats.sellerBalance)}</p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-xs font-bold text-[var(--ink-tertiary)]">คลังระบบ</p>
            <p className="font-display mt-2 text-2xl font-extrabold">{fmt(stats.treasuryBalance)}</p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-xs font-bold text-[var(--ink-tertiary)]">ตรวจบัญชี</p>
            <p className="font-display mt-2 text-2xl font-extrabold">
              {stats.ledgerHealthy ? 'ตรงกัน' : `ต่าง ${fmt(stats.reconcile.delta)}`}
            </p>
          </div>
        </div>
      )}
      {stats && !stats.circulatingSupply && !stats.totalMintedSupply ? (
        <div className="mt-6">
          <EmptyState
            title="ยังไม่มีธุรกรรมเหรียญในช่วงนี้"
            description="เมื่อมีการออกหรือใช้เหรียญในระบบ ตัวเลขจะขึ้นที่นี่ การเติมเหรียญในแอปมือถือถูกปิดไว้จนกว่าจะมีระบบซื้อในแอปจริง"
          />
        </div>
      ) : null}
    </div>
  );
}
