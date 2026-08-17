import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountLockPanel } from '../../components/AccountLockPanel';
import {
  fetchModerationReports,
  fetchModerationUsers,
  hardDeleteUser,
  type ModeratedUser,
  type ModerationReport,
} from '../../lib/api';

export function SafetyUsersPage() {
  const [users, setUsers] = useState<ModeratedUser[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [dangerUserId, setDangerUserId] = useState('');
  const [dangerReason, setDangerReason] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([
        fetchModerationUsers(),
        fetchModerationReports('open'),
      ]);
      setUsers(u.data);
      setReports(r.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด Users ไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const permanentDelete = async () => {
    if (!dangerUserId) return;
    if (confirmText !== 'DELETE') {
      setError('พิมพ์ DELETE เพื่อยืนยัน');
      return;
    }
    if (!dangerReason.trim()) {
      setError('ต้องใส่เหตุผล');
      return;
    }
    if (!window.confirm('ยืนยัน Permanent Delete ครั้งสุดท้าย? กู้คืนไม่ได้')) return;
    setBusyId(dangerUserId);
    try {
      await hardDeleteUser(dangerUserId, dangerReason.trim());
      setDangerOpen(false);
      setConfirmText('');
      setDangerReason('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight">Users</h2>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">
          Primary: Warn / Restrict / Suspend · Secondary: Ban · Advanced: Permanent Delete
        </p>
      </div>

      {error ? (
        <div className="rounded-[14px] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <AccountLockPanel
        reports={reports}
        users={users}
        busyId={busyId}
        setBusyId={setBusyId}
        onDone={refresh}
        onError={setError}
      />

      <section className="surface-panel p-5">
        <h3 className="font-display text-lg font-extrabold">Account Status</h3>
        <ul className="mt-3 max-h-[420px] space-y-2 overflow-auto">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[var(--line)] px-3 py-3"
            >
              <div>
                <p className="text-sm font-bold">{u.displayName}</p>
                <p className="text-xs text-[var(--ink-tertiary)]">
                  {u.handle ?? u.id} · {u.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/safety/users/${encodeURIComponent(u.id)}`}
                  className="btn-secondary !py-1.5 !text-xs"
                >
                  Safety Profile
                </Link>
                {u.status !== 'hard_deleted' ? (
                  <button
                    type="button"
                    className="btn-ghost !text-xs !text-[var(--danger)]"
                    onClick={() => {
                      setDangerUserId(u.id);
                      setDangerOpen(true);
                    }}
                  >
                    Advanced…
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {dangerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[20px] bg-white p-6 shadow-[var(--shadow-md)]">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--danger)]">
              Dangerous Actions
            </p>
            <h3 className="font-display mt-2 text-xl font-extrabold">Permanent Delete</h3>
            <p className="mt-2 text-sm text-[var(--ink-secondary)]">
              ลบข้อมูลส่วนบุคคลถาวร (PDPA) · ขึ้น Social Blacklist · กู้คืนไม่ได้ · ไม่ใช่ปุ่มหลัก
            </p>
            <p className="mt-2 text-xs text-[var(--ink-tertiary)]">User: {dangerUserId}</p>
            <label className="mt-4 block text-xs font-semibold">
              เหตุผล
              <input
                className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] px-3 py-2 text-sm"
                value={dangerReason}
                onChange={(e) => setDangerReason(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs font-semibold">
              พิมพ์ DELETE เพื่อยืนยัน
              <input
                className="mt-1 w-full rounded-[12px] border border-[var(--line-strong)] px-3 py-2 text-sm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </label>
            <div className="mt-5 flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setDangerOpen(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn-primary flex-1 !bg-[var(--danger)]"
                disabled={busyId === dangerUserId}
                onClick={() => void permanentDelete()}
              >
                Permanent Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
