import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  fetchAdminBoardThreads,
  hideAdminBoardThread,
  pinAdminBoardThread,
  type BoardThreadRow,
} from '../lib/api';

export function BoardPage() {
  const [rows, setRows] = useState<BoardThreadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideId, setHideId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminBoardThreads();
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดกระทู้ไม่สำเร็จ');
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
        eyebrow="ชุมชน"
        title="Board"
        description="กระทู้หางานจากแอป — ปักหมุดหรือซ่อนเมื่อผิดนโยบาย"
        helpKey="board"
        actions={
          <button type="button" className="btn-secondary" onClick={() => void refresh()}>
            รีเฟรช
          </button>
        }
      />
      {error ? (
        <div className="mb-6 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}
      <div className="overflow-x-auto surface-panel">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
              <th className="px-4 py-3 font-bold">หัวข้อ</th>
              <th className="px-4 py-3 font-bold">คะแนน</th>
              <th className="px-4 py-3 font-bold">ตอบ</th>
              <th className="px-4 py-3 font-bold">สถานะ</th>
              <th className="px-4 py-3 font-bold">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-[var(--ink-secondary)]" colSpan={5}>
                  กำลังโหลด…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-[var(--ink-secondary)]" colSpan={5}>
                  ยังไม่มีกระทู้ — เมื่อมีประกาศหางานจากแอป รายการจะขึ้นที่นี่
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {row.pinned ? 'ปักหมุด · ' : ''}
                      {row.title}
                    </div>
                    <div className="text-[var(--ink-secondary)]">{row.body.slice(0, 80)}</div>
                  </td>
                  <td className="px-4 py-3">{row.score}</td>
                  <td className="px-4 py-3">{row.replyCount}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void pinAdminBoardThread(row.id, !row.pinned).then(() => refresh())}
                      >
                        {row.pinned ? 'ถอนหมุด' : 'ปักหมุด'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setHideId(row.id)}
                      >
                        ซ่อน
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ConfirmSheet
        open={Boolean(hideId)}
        request={{
          title: 'ซ่อนกระทู้นี้?',
          effects: ['กระทู้ไม่แสดงในบอร์ดสาธารณะ', 'ยังกู้คืนได้จากคิวตรวจ', 'การซ่อนถูกบันทึก'],
          confirmLabel: 'ยืนยันซ่อน',
          requireReason: true,
          danger: true,
        }}
        busy={busy}
        onCancel={() => setHideId(null)}
        onConfirm={() => {
          if (!hideId) return;
          setBusy(true);
          void hideAdminBoardThread(hideId)
            .then(() => {
              setHideId(null);
              return refresh();
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'ซ่อนไม่สำเร็จ'))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
