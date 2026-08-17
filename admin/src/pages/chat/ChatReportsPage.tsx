import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmSheet, type ConfirmRequest } from '../../components/ConfirmSheet';
import { TermTip } from '../../components/TermTip';
import {
  fetchChatReports,
  openReportedMessageAccess,
  resolveChatReport,
  type ChatReport,
} from '../../lib/chatApi';

const PRIMARY: Array<{ id: string; label: string; confirm?: ConfirmRequest }> = [
  {
    id: 'allow',
    label: 'ไม่พบความผิด',
    confirm: {
      title: 'ปิดรายงานนี้ว่าไม่พบความผิด?',
      effects: ['เคสถูกปิด', 'ข้อความยังอยู่', 'บันทึกเหตุผลใน Audit Log'],
      confirmLabel: 'ยืนยันไม่พบความผิด',
      requireReason: true,
    },
  },
  {
    id: 'remove_message',
    label: 'ลบข้อความนี้',
    confirm: {
      title: 'ลบข้อความนี้?',
      effects: ['ข้อความถูกรายงานจะถูกเอาออก', 'ไม่โหลดแชตทั้งสนทนา', 'การลบถูกบันทึก'],
      confirmLabel: 'ยืนยันลบข้อความ',
      requireReason: true,
      danger: true,
    },
  },
];

const ADVANCED: Array<{ id: string; label: string; confirm: ConfirmRequest }> = [
  {
    id: 'restrict_messaging',
    label: 'จำกัดการแชต',
    confirm: {
      title: 'จำกัดการแชตบัญชีนี้?',
      effects: ['ส่งข้อความใหม่ได้น้อยลง', 'ออเดอร์เดิมยังอยู่', 'ปลดได้ภายหลัง'],
      confirmLabel: 'ยืนยันจำกัดการแชต',
      requireReason: true,
      danger: true,
    },
  },
  {
    id: 'mute_user',
    label: 'ปิดเสียงผู้ใช้',
    confirm: {
      title: 'ปิดเสียงผู้ใช้นี้?',
      effects: ['ข้อความใหม่อาจไม่ถึงผู้รับ', 'บัญชียังล็อกอินได้'],
      confirmLabel: 'ยืนยันปิดเสียง',
      requireReason: true,
    },
  },
  {
    id: 'temp_suspend_chat',
    label: 'ระงับแชตชั่วคราว',
    confirm: {
      title: 'ระงับแชตชั่วคราว?',
      effects: ['ส่งข้อความไม่ได้ชั่วคราว', 'เงินใน Escrow ไม่ถูกลบ', 'ปลดได้ภายหลัง'],
      confirmLabel: 'ยืนยันระงับแชต',
      requireReason: true,
      danger: true,
    },
  },
  {
    id: 'escalate',
    label: 'ส่งต่อทีม',
    confirm: {
      title: 'ส่งต่อทีมความปลอดภัย?',
      effects: ['เคสยังเปิดอยู่', 'ทีมอื่นเห็นคิวนี้', 'ยังไม่ระงับบัญชี'],
      confirmLabel: 'ยืนยันส่งต่อ',
      requireReason: true,
    },
  },
  {
    id: 'ban_recommendation',
    label: 'เสนอระงับบัญชี',
    confirm: {
      title: 'เสนอให้ระงับบัญชี?',
      effects: ['ยังไม่ระงับทันที', 'เป็นคำแนะนำให้แอดมินคนอื่นตรวจ', 'ถูกบันทึกใน Audit Log'],
      confirmLabel: 'ยืนยันเสนอ',
      requireReason: true,
    },
  },
  {
    id: 'permanent_ban',
    label: 'ระงับถาวร',
    confirm: {
      title: 'ระงับบัญชีถาวร?',
      effects: [
        'ผู้ใช้เข้าแอปขายและแชตไม่ได้',
        'ออเดอร์เดิมยังอยู่',
        'เงินใน Escrow จะไม่ถูกลบอัตโนมัติ',
        'ต้องผ่านการตรวจโดยคน ไม่ใช่ AI อย่างเดียว',
      ],
      confirmLabel: 'ยืนยันระงับถาวร',
      requireReason: true,
      danger: true,
    },
  },
];

const REVEAL: ConfirmRequest = {
  title: 'ดูบริบทข้อความเพิ่มเติม?',
  effects: [
    'ระบบแสดงเฉพาะช่วงที่เกี่ยวข้องกับรายงาน',
    'ไม่เปิดแชตทั้งสนทนาโดยอัตโนมัติ',
    'เหตุผลถูกบันทึกใน Audit Log',
  ],
  confirmLabel: 'เปิดบริบท',
  requireReason: true,
};

type Pending =
  | { kind: 'reveal'; row: ChatReport; req: ConfirmRequest }
  | { kind: 'act'; id: string; action: string; req: ConfirmRequest };

export function ChatReportsPage() {
  const [rows, setRows] = useState<ChatReport[]>([]);
  const [status, setStatus] = useState('open');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [openMore, setOpenMore] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchChatReports(status);
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดรายงานไม่สำเร็จ');
    }
  }, [status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAct = async (id: string, action: string, reason: string) => {
    setBusy(id);
    setError(null);
    try {
      await resolveChatReport(id, action, reason, action === 'permanent_ban');
      setPending(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const runReveal = async (row: ChatReport, reason: string) => {
    setBusy(row.id);
    setError(null);
    try {
      const res = await openReportedMessageAccess({
        reportId: row.id,
        conversationId: row.conversationId,
        messageId: row.messageId,
        reason,
      });
      setRevealed((m) => ({ ...m, [row.messageId]: res.data.body }));
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เปิดข้อความไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Chat Safety"
        title="ข้อความถูกรายงาน"
        description="ระบบไม่เปิดแชตของทุกคน — แสดงเฉพาะช่วงที่เกี่ยวข้อง และต้องใส่เหตุผลก่อนดูบริบทเพิ่ม"
        helpKey="chatSafety"
        actions={
          <select
            className="rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-semibold"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">รอตรวจ</option>
            <option value="in_review">กำลังตรวจ</option>
            <option value="escalated">ส่งต่อแล้ว</option>
            <option value="resolved">ปิดแล้ว</option>
            <option value="all">ทั้งหมด</option>
          </select>
        }
      />

      {error ? (
        <div className="mb-4 rounded-[14px] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายงานแชต"
          description="เมื่อผู้ใช้รายงานข้อความ หรือระบบชี้ความเสี่ยงเรื่องการชำระเงินนอกแอป คิวจะขึ้นที่นี่ คิวว่างคือสถานะจริง"
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <article key={row.id} className="surface-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
                    CASE #{row.caseId} · ความเสี่ยง <TermTip term="risk">{row.riskScore}</TermTip> · รายงาน{' '}
                    {row.reportCount} ครั้ง · ประวัติ {row.previousViolations}
                  </p>
                  <h3 className="font-display mt-1 text-lg font-extrabold tracking-tight">{row.reason}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                    ผู้รายงาน {row.reporterRef} → ผู้ถูกรายงาน {row.reportedUserId}
                  </p>
                </div>
                <span className="status-pill warn">{row.status}</span>
              </div>

              <div className="mt-4 rounded-[12px] bg-[var(--bg)] px-3 py-3 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
                  เหตุผลที่ตรวจพบ
                </p>
                <p className="mt-1 font-medium">{row.reason}</p>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
                  ข้อความที่เกี่ยวข้อง
                </p>
                <p className="mt-1 font-medium">{revealed[row.messageId] ?? row.messagePreview}</p>
              </div>

              <p className="mt-3 text-xs text-[var(--ink-tertiary)]">
                {new Date(row.createdAt).toLocaleString('th-TH')}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary !text-xs"
                  disabled={busy === row.id}
                  onClick={() => setPending({ kind: 'reveal', row, req: REVEAL })}
                >
                  ดูบริบทเพิ่มเติม
                </button>
                {PRIMARY.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="btn-secondary !text-xs"
                    disabled={busy === row.id}
                    onClick={() =>
                      a.confirm
                        ? setPending({ kind: 'act', id: row.id, action: a.id, req: a.confirm })
                        : void runAct(row.id, a.id, '')
                    }
                  >
                    {a.label}
                  </button>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    onClick={() => setOpenMore((id) => (id === row.id ? null : row.id))}
                  >
                    ⋯
                  </button>
                  {openMore === row.id ? (
                    <div className="absolute right-0 z-10 mt-1 min-w-[180px] rounded-[12px] border border-[var(--line)] bg-white p-1 shadow-[var(--shadow-md)]">
                      {ADVANCED.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="block w-full rounded-[10px] px-3 py-2 text-left text-xs font-bold hover:bg-[var(--bg)]"
                          onClick={() => {
                            setOpenMore(null);
                            setPending({ kind: 'act', id: row.id, action: a.id, req: a.confirm });
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmSheet
        open={Boolean(pending)}
        request={pending?.req ?? null}
        busy={Boolean(busy)}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => {
          if (!pending) return;
          if (pending.kind === 'reveal') void runReveal(pending.row, reason);
          else void runAct(pending.id, pending.action, reason);
        }}
      />
    </div>
  );
}
