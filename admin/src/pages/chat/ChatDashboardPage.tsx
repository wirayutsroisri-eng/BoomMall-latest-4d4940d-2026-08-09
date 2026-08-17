import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { SummaryCard } from '../../components/SummaryCard';
import { fetchChatDashboard, type ChatDashboard } from '../../lib/chatApi';

function healthClass(h: string) {
  if (h === 'HEALTHY') return 'ok';
  if (h === 'DEGRADED') return 'warn';
  return 'danger';
}

function healthLabel(h?: string) {
  if (h === 'HEALTHY') return 'ปกติ';
  if (h === 'DEGRADED') return 'ช้าลง';
  if (h === 'CRITICAL') return 'วิกฤต';
  return h ?? '…';
}

export function ChatDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ChatDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchChatDashboard();
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด Chat Dashboard ไม่สำเร็จ');
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
    <div>
      <PageHeader
        eyebrow="แชต"
        title="สุขภาพระบบข้อความ"
        description="สถานะแชตแบบสรุป — กดการ์ดเพื่อเจาะลึก ไม่แสดงเนื้อหาข้อความส่วนตัว"
        helpKey="chatSafety"
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
        <span className={`status-pill ${healthClass(data?.health ?? 'DEGRADED')}`}>
          {healthLabel(data?.health)}
        </span>
        {data?.alerts?.map((a) => (
          <span key={a} className="status-pill warn">
            {a}
          </span>
        ))}
        {data ? (
          <span className="text-xs text-[var(--ink-tertiary)]">
            อัปเดต {new Date(data.generatedAt).toLocaleString('th-TH')}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="บทสนทนาที่ใช้งาน" value={fmt(data?.activeConversations)} onClick={() => navigate('/safety/chat/analytics')} />
        <SummaryCard title="ข้อความต่อนาที" value={fmt(data?.messagesPerMinute)} onClick={() => navigate('/safety/chat/analytics')} />
        <SummaryCard title="อัตราส่งสำเร็จ" value={data ? `${data.deliverySuccessRate}%` : '—'} onClick={() => navigate('/safety/chat/delivery')} />
        <SummaryCard title="ข้อความส่งไม่สำเร็จ" value={fmt(data?.failedMessages)} deltaTone="down" onClick={() => navigate('/safety/chat/delivery')} />
        <SummaryCard title="การเชื่อมต่อเรียลไทม์" value={fmt(data?.realtimeConnections)} onClick={() => navigate('/safety/chat/realtime')} />
        <SummaryCard title="ข้อความค้างยังไม่อ่าน" value={fmt(data?.unreadBacklog)} onClick={() => navigate('/safety/chat/delivery')} />
        <SummaryCard title="พุชล้มเหลว" value={fmt(data?.pushNotificationFailures)} onClick={() => navigate('/safety/chat/notifications')} />
        <SummaryCard title="ข้อความถูกรายงาน" value={fmt(data?.reportedMessages)} onClick={() => navigate('/safety/chat/reports')} />
        <SummaryCard title="ผู้ใช้ที่ถูกบล็อก" value={fmt(data?.blockedUsers)} onClick={() => navigate('/safety/chat/blocks')} />
        <SummaryCard title="เหตุสแปม" value={fmt(data?.spamIncidents)} onClick={() => navigate('/safety/chat/antispam')} />
        <SummaryCard title="เหตุละเมิด" value={fmt(data?.abuseIncidents)} onClick={() => navigate('/safety/chat/reports')} />
      </div>
    </div>
  );
}

function fmt(n?: number) {
  if (n == null) return '—';
  return n.toLocaleString('th-TH');
}
