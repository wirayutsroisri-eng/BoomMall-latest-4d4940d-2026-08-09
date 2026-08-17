import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmSheet, type ConfirmRequest } from '../../components/ConfirmSheet';
import { TermTip } from '../../components/TermTip';
import {
  fetchModeratedContent,
  moderateContent,
  type ContentModerationRecord,
} from '../../lib/api';

const HIDE: ConfirmRequest = {
  title: 'จำกัดการมองเห็นคอนเทนต์นี้?',
  effects: ['คนอื่นเห็นได้น้อยลงหรือไม่เห็นในฟีด', 'เจ้าของบัญชียังเห็นของตนเองได้', 'สามารถคืนได้ภายหลัง'],
  confirmLabel: 'ยืนยันจำกัด',
  requireReason: true,
};

const REMOVE: ConfirmRequest = {
  title: 'ลบคอนเทนต์นี้?',
  effects: ['คอนเทนต์ถูกเอาออกจากฟีด', 'การลบถูกบันทึกใน Audit Log', 'ผู้ใช้อาจอุทธรณ์ได้'],
  confirmLabel: 'ยืนยันลบ',
  requireReason: true,
  danger: true,
};

export function SafetyContentPage() {
  const [rows, setRows] = useState<ContentModerationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [manualId, setManualId] = useState('');
  const [openMore, setOpenMore] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    id: string;
    action: 'hide' | 'remove' | 'restore';
    req: ConfirmRequest;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRows((await fetchModeratedContent()).data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดคิวคอนเทนต์ไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (id: string, action: 'hide' | 'remove' | 'restore', reason?: string) => {
    if (!id) return;
    setBusy(true);
    try {
      await moderateContent(id, action, reason || 'policy');
      setPending(null);
      setManualId('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="ความปลอดภัย"
        title="คิวตรวจคอนเทนต์"
        description="โพสต์ที่ถูกรายงาน สแปม สแกม หรือถูกธงโดยระบบ — อนุญาต จำกัด หรือลบจากที่นี่"
        helpKey="moderation"
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      {rows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคอนเทนต์ในคิวตรวจ"
          description="เมื่อมีรายงานโพสต์ สแปม สินค้าปลอม หรือระบบชี้ความเสี่ยง รายการจะขึ้นที่นี่เอง"
        />
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <article key={c.contentId} className="surface-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="status-pill warn">{c.status}</span>
                  {c.auto ? <span className="ml-2 status-pill warn">ธงโดยระบบ</span> : null}
                  <h3 className="font-display mt-2 text-lg font-extrabold">{c.captionPreview ?? c.contentId}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-secondary)]">{c.reason}</p>
                  <p className="mt-1 text-xs text-[var(--ink-tertiary)]">
                    {c.authorHandle ?? c.authorUserId ?? '—'} · {c.actedBy}
                  </p>
                </div>
                <TermTip term="risk">ความเสี่ยง</TermTip>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary !text-xs"
                  onClick={() => void run(c.contentId, 'restore')}
                >
                  อนุญาต
                </button>
                <button
                  type="button"
                  className="btn-secondary !text-xs"
                  onClick={() => setPending({ id: c.contentId, action: 'hide', req: HIDE })}
                >
                  จำกัดการมองเห็น
                </button>
                <button
                  type="button"
                  className="btn-danger !text-xs"
                  onClick={() => setPending({ id: c.contentId, action: 'remove', req: REMOVE })}
                >
                  ลบ
                </button>
                <div className="relative">
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    onClick={() => setOpenMore((id) => (id === c.contentId ? null : c.contentId))}
                  >
                    ⋯
                  </button>
                  {openMore === c.contentId ? (
                    <div className="absolute right-0 z-10 mt-1 min-w-[160px] rounded-[12px] border border-[var(--line)] bg-white p-1 shadow-[var(--shadow-md)]">
                      <p className="px-3 py-2 text-[11px] text-[var(--ink-tertiary)]">
                        การเตือนบัญชีทำที่ศูนย์จัดการเคส เพื่อไม่ให้ตัดสินจากหน้านี้โดยไม่มีประวัติ
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-8">
        <button type="button" className="btn-ghost" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? 'ซ่อนเครื่องมือขั้นสูง' : 'ดูรายละเอียด / เครื่องมือขั้นสูง'}
        </button>
        {advanced ? (
          <div className="surface-panel mt-3 flex flex-wrap gap-2 p-4">
            <input
              className="min-w-[160px] flex-1 rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm"
              placeholder="รหัสคอนเทนต์ (ขั้นสูง)"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPending({ id: manualId.trim(), action: 'hide', req: HIDE })}
            >
              จำกัด
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setPending({ id: manualId.trim(), action: 'remove', req: REMOVE })}
            >
              ลบ
            </button>
          </div>
        ) : null}
      </div>

      <ConfirmSheet
        open={Boolean(pending)}
        request={pending?.req ?? null}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => {
          if (!pending) return;
          void run(pending.id, pending.action, reason);
        }}
      />
    </div>
  );
}
