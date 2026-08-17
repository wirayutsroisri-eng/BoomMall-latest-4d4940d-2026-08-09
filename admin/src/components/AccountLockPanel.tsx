import { useMemo, useState } from 'react';
import {
  banUser,
  unlockUser,
  type ModeratedUser,
  type ModerationReport,
} from '../lib/api';

type Props = {
  reports: ModerationReport[];
  users: ModeratedUser[];
  busyId: string | null;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
  setBusyId: (id: string | null) => void;
};

/**
 * Easy Lock / Unlock — App Store Guideline 1.2
 * Lock only from a user report. Unlock after human review with reason + audit.
 */
export function AccountLockPanel({
  reports,
  users,
  busyId,
  onDone,
  onError,
  setBusyId,
}: Props) {
  const [selectedReportId, setSelectedReportId] = useState('');
  const [unlockReason, setUnlockReason] = useState('');

  const openReports = useMemo(
    () => reports.filter((r) => r.status === 'open' || r.status === 'reviewed'),
    [reports],
  );

  const selected = openReports.find((r) => r.id === selectedReportId) ?? null;
  const lockUserId = selected?.kind === 'user' ? selected.targetId : selected?.targetId;

  const lockedUsers = users.filter(
    (u) => u.status === 'soft_banned' || u.status === 'banned',
  );

  const lock = async (mode: 'soft' | 'hard') => {
    if (!selected || !lockUserId) {
      onError('เลือกรายงานจากผู้ใช้ก่อน — ตาม App Store ต้องมีรายงานก่อนล็อกบัญชี');
      return;
    }
    const label = mode === 'soft' ? 'ล็อกชั่วคราว' : 'ล็อกถาวร';
    if (!window.confirm(`${label} บัญชีนี้จากรายงาน “${selected.reason}”?`)) return;
    setBusyId(selected.id);
    try {
      await banUser(
        lockUserId,
        `จากรายงานผู้ใช้: ${selected.reason}`,
        mode,
        selected.id,
      );
      setSelectedReportId('');
      await onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'ล็อกบัญชีไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const unlock = async (userId: string) => {
    const reason =
      unlockReason.trim() ||
      window.prompt('เหตุผลในการปลดล็อก (บังคับ · บันทึก Audit)') ||
      '';
    if (!reason.trim()) {
      onError('ต้องใส่เหตุผลก่อนปลดล็อก');
      return;
    }
    setBusyId(userId);
    try {
      await unlockUser(userId, reason.trim());
      setUnlockReason('');
      await onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'ปลดล็อกไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="surface-panel overflow-hidden">
      <div className="border-b border-[var(--line)] px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
          App Store · Guideline 1.2
        </p>
        <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight">
          ล็อก / ปลดล็อกบัญชี
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-secondary)]">
          ล็อกได้เฉพาะเมื่อมีรายงานจากผู้ใช้ในแอป (Report) · ปลดล็อกต้องใส่เหตุผลและบันทึก Audit
        </p>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        {/* Lock from report */}
        <div>
          <h3 className="text-sm font-bold text-[var(--ink)]">1) เลือกรายงานจากผู้ใช้</h3>
          {openReports.length === 0 ? (
            <p className="mt-3 rounded-[14px] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--ink-tertiary)]">
              ยังไม่มีรายงานเปิด — ผู้ใช้ต้องกด Report ในแอปก่อน ถึงจะล็อกบัญชีได้
            </p>
          ) : (
            <ul className="mt-3 max-h-64 space-y-2 overflow-auto">
              {openReports.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedReportId(r.id)}
                    className={`w-full rounded-[14px] border px-3 py-3 text-left transition ${
                      selectedReportId === r.id
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--line)] bg-white hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <p className="text-sm font-bold text-[var(--ink)]">{r.reason}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">
                      {r.kind} · {r.targetLabel ?? r.targetId} · โดย {r.reporterRef ?? 'user'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={!selected || busyId === selected?.id}
              onClick={() => void lock('soft')}
            >
              ล็อกชั่วคราว
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!selected || busyId === selected?.id}
              onClick={() => void lock('hard')}
            >
              ล็อกถาวร
            </button>
          </div>
          {selected ? (
            <p className="mt-2 text-xs text-[var(--ink-tertiary)]">
              จะล็อก: <strong>{lockUserId}</strong> จากรายงาน {selected.id}
            </p>
          ) : null}
        </div>

        {/* Unlock */}
        <div>
          <h3 className="text-sm font-bold text-[var(--ink)]">2) ปลดล็อกหลังตรวจสอบ</h3>
          <label className="mt-3 block text-xs font-semibold text-[var(--ink-tertiary)]">
            เหตุผลปลดล็อก (ใช้ร่วมกันได้)
            <input
              className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2.5 text-sm"
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="เช่น ตรวจสอบแล้วไม่ผิดนโยบาย"
            />
          </label>
          {lockedUsers.length === 0 ? (
            <p className="mt-3 rounded-[14px] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--ink-tertiary)]">
              ไม่มีบัญชีที่ถูกล็อกอยู่
            </p>
          ) : (
            <ul className="mt-3 max-h-64 space-y-2 overflow-auto">
              {lockedUsers.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[var(--line)] px-3 py-3"
                >
                  <div>
                    <p className="text-sm font-bold">{u.displayName}</p>
                    <p className="text-xs text-[var(--ink-tertiary)]">
                      {u.handle ?? u.id} ·{' '}
                      <span className="font-semibold text-[var(--warn)]">
                        {u.status === 'soft_banned' ? 'ล็อกชั่วคราว' : 'ล็อกถาวร'}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary !py-1.5 !text-xs"
                    disabled={busyId === u.id}
                    onClick={() => void unlock(u.id)}
                  >
                    ปลดล็อก
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
