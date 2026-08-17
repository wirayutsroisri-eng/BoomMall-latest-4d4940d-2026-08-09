import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { SummaryCard } from '../components/SummaryCard';
import { TermTip } from '../components/TermTip';
import { useAdminAuth } from '../auth/AdminAuthContext';
import {
  fetchModerationStats,
  fetchSellerWithdrawals,
  fetchStats,
  type DashboardStats,
  type ModerationStats,
} from '../lib/api';
import { fetchSafetyOverview, type SafetyOverview } from '../lib/safetyApi';

function fmt(n: string | number | undefined) {
  if (n == null) return '—';
  try {
    return typeof n === 'number'
      ? n.toLocaleString('th-TH')
      : BigInt(n).toLocaleString('th-TH');
  } catch {
    return String(n);
  }
}

type QueueItem = { tone: 'high' | 'mid' | 'low'; title: string; count: number; to: string };

export function DashboardPage() {
  const navigate = useNavigate();
  const { session } = useAdminAuth();
  const nav = session?.nav;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [mod, setMod] = useState<ModerationStats | null>(null);
  const [safety, setSafety] = useState<SafetyOverview | null>(null);
  const [pendingPayouts, setPendingPayouts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m, o, wd] = await Promise.all([
        fetchStats(),
        fetchModerationStats().catch(() => null),
        fetchSafetyOverview().catch(() => null),
        fetchSellerWithdrawals().catch(() => null),
      ]);
      setStats(s.data);
      setMod(m?.data ?? null);
      setSafety(o?.data ?? null);
      setPendingPayouts(
        (wd?.data ?? []).filter((r) => String(r.status).toLowerCase().includes('pend')).length,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดสถานะไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const queue: QueueItem[] = [];
  const scam = safety?.scamAlerts ?? 0;
  const critical = safety?.criticalCases ?? 0;
  const reports = mod?.openReports ?? safety?.newReports ?? 0;
  const chat = safety?.chatAbuseAlerts ?? 0;
  const pendingReview = safety?.pendingReview ?? 0;
  if (nav?.safety !== false) {
    if (scam > 0) queue.push({ tone: 'high', title: 'ความเสี่ยงสแกม', count: scam, to: '/safety/chat/reports' });
    if (critical > 0) queue.push({ tone: 'high', title: 'เคสร้ายแรง', count: critical, to: '/safety/cases' });
    if (reports > 0) queue.push({ tone: 'mid', title: 'รายงานรอตรวจ', count: reports, to: '/safety/reports' });
    if (chat > 0) queue.push({ tone: 'mid', title: 'แชตถูกรายงาน', count: chat, to: '/safety/chat/reports' });
    if (pendingReview > 0) queue.push({ tone: 'low', title: 'คอนเทนต์รอตรวจ', count: pendingReview, to: '/safety/content' });
  }
  if (nav?.finance !== false && pendingPayouts > 0) {
    queue.push({ tone: 'high', title: 'การถอนเงินรอตรวจ', count: pendingPayouts, to: '/finance' });
  }

  return (
    <div>
      <PageHeader
        eyebrow="วันนี้"
        title="ต้องรู้ก่อนเริ่มงาน"
        description="ตัวเลขสำคัญของวันนี้ และคิวที่ต้องจัดการ — กดรายการเพื่อเข้าคิวทันที"
        helpKey="dashboard"
        actions={
          <button type="button" className="btn-secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'กำลังอัปเดต…' : 'รีเฟรช'}
          </button>
        }
      />

      {error ? (
        <div className="mb-6 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className={`status-pill ${stats?.ledgerHealthy ? 'ok' : stats ? 'danger' : 'warn'}`}>
          {stats ? (stats.ledgerHealthy ? 'บัญชีตรงกัน' : 'บัญชียังไม่ตรง — กดการเงิน') : 'กำลังตรวจระบบ'}
        </span>
        {stats ? (
          <span className="text-xs font-medium text-[var(--ink-tertiary)]">
            อัปเดต {new Date(stats.generatedAt).toLocaleString('th-TH')}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {nav?.finance !== false || nav?.sellers !== false ? (
          <SummaryCard
            title="ยอดขายวันนี้"
            value={stats ? `฿${fmt(stats.gmvPaidThb ?? stats.totalCompanyRevenueThb)}` : '—'}
            subtitle={<TermTip term="gmv">GMV / Gross Sales</TermTip>}
            onClick={() => navigate('/orders')}
          />
        ) : null}
        {nav?.finance !== false ? (
          <SummaryCard
            title="GP"
            value={stats?.gpCollectedThb != null ? `฿${fmt(stats.gpCollectedThb)}` : '—'}
            subtitle={<TermTip term="gp">ค่าธรรมเนียมแพลตฟอร์ม</TermTip>}
            onClick={() => navigate('/finance?focus=gp')}
          />
        ) : null}
        {nav?.users !== false ? (
          <SummaryCard
            title="ผู้ใช้ที่ใช้งาน"
            value={loading && !stats ? '…' : fmt(stats?.dau24h ?? stats?.userCount)}
            subtitle={stats?.userCount != null ? `ลงทะเบียน ${fmt(stats.userCount)}` : '24 ชั่วโมง'}
            onClick={() => navigate('/users')}
          />
        ) : null}
        {nav?.safety !== false ? (
          <SummaryCard
            title="เคสเปิดอยู่"
            value={fmt(safety?.criticalCases ?? mod?.openReports)}
            subtitle="กดเพื่อเข้าศูนย์จัดการเคส"
            deltaTone={(safety?.criticalCases ?? 0) > 0 ? 'down' : 'up'}
            onClick={() => navigate('/safety/cases')}
          />
        ) : null}
      </div>

      <section className="mt-8">
        <h2 className="font-display text-xl font-extrabold tracking-tight">ต้องจัดการ</h2>
        <p className="mt-1 mb-4 text-sm text-[var(--ink-secondary)]">เรียงจากความเร่งด่วน — คิวว่างหมายความว่าไม่มีงานค้างจริง</p>
        {queue.length === 0 ? (
          <div className="surface-panel p-6 text-sm text-[var(--ink-secondary)]">
            ไม่มีคิวด่วนตอนนี้ เมื่อมีรายงาน สแกม หรือคำขอถอนเงิน รายการจะขึ้นที่นี่เอง
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((item) => (
              <button key={item.title} type="button" className="queue-row" onClick={() => navigate(item.to)}>
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    item.tone === 'high' ? 'bg-[var(--danger)]' : item.tone === 'mid' ? 'bg-[var(--warn)]' : 'bg-[var(--accent)]'
                  }`}
                />
                <span className="flex-1 font-bold">{item.title}</span>
                <span className="text-sm font-extrabold">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
