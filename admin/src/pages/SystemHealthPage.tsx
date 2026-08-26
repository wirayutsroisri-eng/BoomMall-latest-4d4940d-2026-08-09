import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { fetchStats, type DashboardStats } from '../lib/api';
import { fetchChatDashboard, type ChatDashboard } from '../lib/chatApi';

export function SystemHealthPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chat, setChat] = useState<ChatDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        fetchStats(),
        fetchChatDashboard().catch(() => null),
      ]);
      setStats(s.data);
      setChat(c?.data ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดสถานะระบบไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader
        eyebrow="ระบบ"
        title="สุขภาพระบบ"
        description="ตรวจสถานะข้อมูลหลักและระบบข้อความจากบริการจริง"
        helpKey="health"
        actions={
          <button type="button" className="btn-secondary" onClick={() => void refresh()}>
            รีเฟรช
          </button>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {!stats ? (
        <EmptyState title="กำลังตรวจระบบ" description="รอตัวเลขจากบัญชีจริง หากโหลดนาน ให้ลองรีเฟรชอีกครั้ง" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="surface-panel p-5">
            <p className="text-xs font-bold text-[var(--ink-tertiary)]">ข้อมูลแพลตฟอร์ม</p>
            <p className="font-display mt-2 text-2xl font-extrabold">
              ผู้ใช้ {stats.userCount ?? 0} · โพสต์ {stats.postCount ?? 0}
            </p>
            <p className="mt-2 text-sm text-[var(--ink-secondary)]">
              อัปเดต {new Date(stats.generatedAt).toLocaleString('th-TH')}
            </p>
            <Link to="/analytics" className="mt-4 inline-flex text-sm font-bold text-[var(--accent-strong)]">
              เปิด Analytics
            </Link>
          </article>
          <article className="surface-panel p-5">
            <p className="text-xs font-bold text-[var(--ink-tertiary)]">ระบบข้อความ</p>
            <p className="font-display mt-2 text-2xl font-extrabold">
              {chat?.health === 'HEALTHY' ? 'ปกติ' : chat?.health === 'DEGRADED' ? 'ช้าลง' : chat?.health === 'CRITICAL' ? 'วิกฤต' : '—'}
            </p>
            <p className="mt-2 text-sm text-[var(--ink-secondary)]">
              สถานะส่งข้อความจาก Chat Service จริง ไม่ใช่ตัวเลขจำลอง
            </p>
            <Link to="/safety/chat" className="mt-4 inline-flex text-sm font-bold text-[var(--accent-strong)]">
              เปิดสุขภาพแชต
            </Link>
          </article>
        </div>
      )}
    </div>
  );
}
