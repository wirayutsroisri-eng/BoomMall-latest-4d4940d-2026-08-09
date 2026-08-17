import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { TermTip } from '../../components/TermTip';
import {
  createSafetyCase,
  fetchSafetyReports,
  type SafetyReportRow,
} from '../../lib/safetyApi';

export function SafetyReportsPage() {
  const [rows, setRows] = useState<SafetyReportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchSafetyReports({
        status: status === 'all' ? undefined : status,
        kind: kind || undefined,
        reason: reason || undefined,
      });
      setRows(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด Reports ไม่สำเร็จ');
    }
  }, [status, kind, reason]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const mergeCase = async () => {
    if (selected.size === 0) return;
    try {
      const c = await createSafetyCase([...selected]);
      setMsg(`สร้าง Case ${c.data.id} แล้ว`);
      setSelected(new Set());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สร้าง Case ไม่สำเร็จ');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="ความปลอดภัย"
        title="รายงานจากผู้ใช้"
        description="คิวรายงาน — รวมเป็นเคสเมื่อเป็นเรื่องเดียวกัน แล้วไปตัดสินที่ศูนย์จัดการเคส"
        helpKey="safety"
        actions={
          <button
            type="button"
            className="btn-primary"
            disabled={selected.size === 0}
            onClick={() => void mergeCase()}
          >
            รวมเป็นเคส ({selected.size})
          </button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <select
          className="rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">ทุกสถานะ</option>
          <option value="OPEN">รอตรวจ</option>
          <option value="IN_REVIEW">กำลังตรวจ</option>
          <option value="ACTION_TAKEN">ดำเนินการแล้ว</option>
          <option value="NO_VIOLATION">ไม่พบความผิด</option>
          <option value="ESCALATED">ส่งต่อแล้ว</option>
          <option value="CLOSED">ปิดแล้ว</option>
        </select>
        <select
          className="rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">ทุกประเภท</option>
          <option value="user">ผู้ใช้</option>
          <option value="content">โพสต์</option>
          <option value="message">แชต</option>
          <option value="comment">คอมเมนต์</option>
        </select>
        <input
          className="rounded-xl border border-[var(--line-strong)] px-3 py-2 text-sm sm:col-span-2"
          placeholder="กรองเหตุผล"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--ok)]">{msg}</p> : null}

      {rows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายงาน"
          description="เมื่อผู้ใช้รายงานโพสต์ คอมเมนต์ แชต หรือบัญชี คิวจะขึ้นที่นี่ คิวว่างคือสถานะจริง"
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <article key={r.id} className="surface-panel p-5">
              <div className="flex flex-wrap items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="status-pill warn">{r.statusLabel}</span>
                    <span className={`status-pill ${riskTone(r.riskBand)}`}>
                      <TermTip term="risk">{r.riskBand}</TermTip> · {r.riskScore}
                    </span>
                    <span className="text-xs font-semibold text-[var(--ink-tertiary)]">
                      {r.kind} · reports {r.reportCount}
                    </span>
                  </div>
                  <h3 className="font-display mt-2 text-lg font-extrabold">{r.reason}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                    ผู้รายงาน {r.reporterRef ?? '—'} → ผู้ถูกรายงาน {r.targetLabel ?? r.targetId}
                  </p>
                  <p className="mt-2 text-xs text-[var(--ink-tertiary)]">
                    Risk from:{' '}
                    {r.riskSignals.length
                      ? r.riskSignals.map((s) => `${s.signal}(+${s.contribution})`).join(', ')
                      : 'no matched signals'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-tertiary)]">
                    {new Date(r.createdAt).toLocaleString('th-TH')}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function riskTone(band: string) {
  if (band === 'Critical') return 'danger';
  if (band === 'High') return 'warn';
  if (band === 'Medium') return 'warn';
  return 'ok';
}
