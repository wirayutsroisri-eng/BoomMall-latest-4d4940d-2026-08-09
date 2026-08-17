import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadAdminNotices, type AdminNotice } from '../lib/adminNotices';
import { IconBell } from './icons';

function toneDot(tone: AdminNotice['tone']) {
  if (tone === 'high') return 'bg-[var(--danger)]';
  if (tone === 'mid') return 'bg-[var(--warn)]';
  return 'bg-[var(--accent)]';
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotice[]>([]);

  const refresh = useCallback(async () => {
    try {
      setItems(await loadAdminNotices());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const badge = items.reduce((n, i) => n + i.count, 0);

  return (
    <div className="relative">
      <button
        type="button"
        className="btn-ghost relative"
        aria-label="การแจ้งเตือน"
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell className="h-5 w-5" />
        {badge > 0 ? <span className="notice-badge">{badge > 99 ? '99+' : badge}</span> : null}
      </button>
      {open ? (
        <div className="notice-pop">
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--ink-tertiary)]">
            ต้องจัดการ
          </p>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--ink-secondary)]">ไม่มีคิวที่ต้องจัดการตอนนี้</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="notice-item"
                onClick={() => {
                  setOpen(false);
                  navigate(item.to);
                }}
              >
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${toneDot(item.tone)}`} />
                <span className="flex-1 text-left text-sm font-semibold">{item.title}</span>
                <span className="text-xs font-bold text-[var(--ink-tertiary)]">{item.count}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
