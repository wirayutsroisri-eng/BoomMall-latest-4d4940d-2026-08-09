import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { loadAdminNotices, type AdminNotice } from '../lib/adminNotices';

function toneDot(tone: AdminNotice['tone']) {
  if (tone === 'high') return 'bg-[var(--danger)]';
  if (tone === 'mid') return 'bg-[var(--warn)]';
  return 'bg-[var(--accent)]';
}

export function AlertsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminNotice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await loadAdminNotices());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดการแจ้งเตือนไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div>
      <PageHeader
        eyebrow="ภาพรวม"
        title="การแจ้งเตือน"
        description="รายการที่กดแล้วไปคิวจัดการได้ทันที — ไม่ใช่ข้อความอ่านอย่างเดียว"
        helpKey="alerts"
        actions={
          <button type="button" className="btn-secondary" onClick={() => void refresh()}>
            รีเฟรช
          </button>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {items.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคิวที่ต้องจัดการ"
          description="เมื่อมีรายงาน สแกม คำขอถอนเงิน หรือคอนเทนต์รอตรวจ รายการจะขึ้นที่นี่และที่ไอคอนกระดิ่งด้านบน"
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <button key={item.id} type="button" className="queue-row" onClick={() => navigate(item.to)}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneDot(item.tone)}`} />
              <span className="flex-1 text-left font-bold">{item.title}</span>
              <span className="text-sm font-extrabold">{item.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
