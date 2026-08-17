import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { SummaryCard } from '../../components/SummaryCard';
import { fetchSafetyOverview, type SafetyOverview } from '../../lib/safetyApi';

export function SafetyOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SafetyOverview | null>(null);
  const [trend, setTrend] = useState<'today' | 'days7' | 'days30'>('today');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData((await fetchSafetyOverview()).data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด Overview ไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const t = data?.trends[trend];

  return (
    <div>
      <PageHeader
        eyebrow="ความปลอดภัย"
        title="Fraud / ภาพรวมความเสี่ยง"
        description="กดการ์ดเพื่อเข้าคิวที่ต้องจัดการ — คะแนนความเสี่ยงเป็นสัญญาณ ไม่ใช่คำตัดสิน"
        helpKey="safety"
        actions={
          <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-[var(--line)]">
            {(
              [
                ['today', 'วันนี้'],
                ['days7', '7 วัน'],
                ['days30', '30 วัน'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTrend(k)}
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  trend === k ? 'bg-[var(--ink)] text-white' : 'text-[var(--ink-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <div className="mb-4 rounded-[14px] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {t ? (
        <p className="mb-4 text-xs font-semibold text-[var(--ink-tertiary)]">
          แนวโน้ม · รายงาน {t.reports} · เคส {t.cases} · อุทธรณ์ {t.appeals}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="รายงานใหม่" value={fmt(data?.newReports)} onClick={() => navigate('/safety/reports')} />
        <SummaryCard title="เคสร้ายแรง" value={fmt(data?.criticalCases)} deltaTone="down" onClick={() => navigate('/safety/cases')} />
        <SummaryCard title="รอตรวจ" value={fmt(data?.pendingReview)} onClick={() => navigate('/safety/content')} />
        <SummaryCard title="ซ่อนอัตโนมัติ" value={fmt(data?.autoHidden)} onClick={() => navigate('/safety/content')} />
        <SummaryCard title="ผู้ใช้ถูกแบน" value={fmt(data?.bannedUsers)} onClick={() => navigate('/safety/users')} />
        <SummaryCard title="ผู้ใช้ถูกจำกัด" value={fmt(data?.restrictedUsers)} onClick={() => navigate('/safety/users')} />
        <SummaryCard title="อุทธรณ์รอตรวจ" value={fmt(data?.appealsPending)} onClick={() => navigate('/safety/appeals')} />
        <SummaryCard title="แจ้งเตือนสแปม" value={fmt(data?.spamAlerts)} onClick={() => navigate('/safety/reports')} />
        <SummaryCard title="แจ้งเตือนหลอกลวง" value={fmt(data?.scamAlerts)} onClick={() => navigate('/safety/reports')} />
        <SummaryCard title="แจ้งเตือนละเมิดแชต" value={fmt(data?.chatAbuseAlerts)} onClick={() => navigate('/safety/chat/reports')} />
      </div>
    </div>
  );
}

function fmt(n?: number) {
  return n == null ? '—' : n.toLocaleString('th-TH');
}
