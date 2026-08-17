import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { fetchChatDelivery, type DeliveryEvent } from '../../lib/chatApi';

export function ChatDeliveryPage() {
  const [rows, setRows] = useState<DeliveryEvent[]>([]);
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [errorType, setErrorType] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchChatDelivery({
        status: status || undefined,
        userId: userId || undefined,
        conversationId: conversationId || undefined,
        errorType: errorType || undefined,
      });
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด Delivery ไม่สำเร็จ');
    }
  }, [status, userId, conversationId, errorType]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = {
    sent: rows.filter((r) => r.status === 'sent').length,
    delivered: rows.filter((r) => r.status === 'delivered').length,
    seen: rows.filter((r) => r.status === 'seen').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    retrying: rows.filter((r) => r.status === 'retrying').length,
  };

  return (
    <div>
      <PageHeader
        eyebrow="แชต · การส่ง"
        title="การส่งข้อความ"
        description="ดูสถานะส่งข้อความโดยไม่เปิดเนื้อหา — ข้อมูลมาจาก Chat Service ingest จริง"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-5">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="surface-panel px-4 py-3">
            <p className="text-xs font-semibold uppercase text-[var(--ink-tertiary)]">{k}</p>
            <p className="font-display mt-1 text-2xl font-extrabold">{v}</p>
          </div>
        ))}
      </div>

      <div className="surface-panel mb-5 grid gap-3 p-4 sm:grid-cols-4">
        <select
          className="rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All status</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="seen">Seen</option>
          <option value="failed">Failed</option>
          <option value="retrying">Retrying</option>
        </select>
        <input
          className="rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm"
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <input
          className="rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm"
          placeholder="Conversation ID"
          value={conversationId}
          onChange={(e) => setConversationId(e.target.value)}
        />
        <input
          className="rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm"
          placeholder="Error type"
          value={errorType}
          onChange={(e) => setErrorType(e.target.value)}
        />
      </div>

      {error ? (
        <div className="mb-4 rounded-[14px] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="surface-panel p-8 text-[var(--ink-secondary)]">
          ยังไม่มี delivery events จาก Chat workers
        </div>
      ) : (
        <div className="surface-panel overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--ink-tertiary)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Conversation</th>
                <th className="px-4 py-3 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.id} className="border-b border-[var(--line)]">
                  <td className="px-4 py-3">{new Date(r.createdAt).toLocaleString('th-TH')}</td>
                  <td className="px-4 py-3 font-semibold">{r.status}</td>
                  <td className="px-4 py-3">{r.userId}</td>
                  <td className="px-4 py-3">{r.conversationId}</td>
                  <td className="px-4 py-3">{r.errorType ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
