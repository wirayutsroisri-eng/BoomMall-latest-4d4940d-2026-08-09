import { useCallback, useEffect, useState } from 'react';
import {
  banUser,
  fetchAuditLog,
  fetchBlacklist,
  fetchModeratedContent,
  fetchModerationReports,
  fetchModerationStats,
  fetchModerationUsers,
  hardDeleteUser,
  moderateContent,
  resolveModerationReport,
  type AuditEntry,
  type ContentModerationRecord,
  type ModeratedUser,
  type ModerationReport,
  type ModerationStats,
  type SocialBlacklistEntry,
} from '../lib/api';

/**
 * Golden Rule #1 — One-Screen Resolution:
 * Reports + Flagged content + Account status + analytics in a single dashboard.
 */
export function ModerationPage() {
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [content, setContent] = useState<ContentModerationRecord[]>([]);
  const [users, setUsers] = useState<ModeratedUser[]>([]);
  const [blacklist, setBlacklist] = useState<SocialBlacklistEntry[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const [manualReason, setManualReason] = useState('เนื้อหาไม่เหมาะสม');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r, c, u, b, a] = await Promise.all([
        fetchModerationStats(),
        fetchModerationReports(statusFilter),
        fetchModeratedContent(),
        fetchModerationUsers(),
        fetchBlacklist(),
        fetchAuditLog(30),
      ]);
      setStats(s.data);
      setReports(r.data);
      setContent(c.data);
      setUsers(u.data);
      setBlacklist(b.data);
      setAudit(a.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดคิว moderation ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 12_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const actReport = async (
    reportId: string,
    action: 'hide' | 'remove' | 'dismiss',
  ) => {
    setBusyId(reportId);
    try {
      await resolveModerationReport(reportId, action);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const actContent = async (contentId: string, action: 'hide' | 'remove' | 'restore') => {
    setBusyId(contentId);
    try {
      await moderateContent(contentId, action, manualReason);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const onBan = async (userId: string, mode: 'soft' | 'hard') => {
    setBusyId(userId);
    try {
      await banUser(userId, manualReason || 'policy violation', mode);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'แบนไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const onHardDelete = async (userId: string) => {
    if (!window.confirm('Hard Delete ตาม PDPA? ลบข้อมูลส่วนบุคคลและขึ้น Social Blacklist')) return;
    setBusyId(userId);
    try {
      await hardDeleteUser(userId, 'PDPA hard delete');
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
        <h2 className="font-display text-2xl font-extrabold text-[#0b1f17]">
          All-in-One Moderation
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-[#122820]/70">
          10 Golden Rules · Hide / Delete / Ban · Auto-hide เมื่อเกิน 3 unique reports · Social Blacklist ·
          PDPA Hard Delete · Sync แบบ real-time ไปที่แอป
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {/* Rule 10 — analytics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="รายงานใหม่ (เปิด)" value={stats?.openReports ?? '—'} />
        <Stat label="Auto-Hidden" value={stats?.autoHiddenPosts ?? '—'} />
        <Stat label="Banned Users" value={stats?.bannedUsers ?? '—'} />
        <Stat label="Pending Review" value={stats?.pendingReview ?? '—'} />
      </div>

      {stats?.topCategories?.length ? (
        <div className="rounded-2xl border border-[#122820]/10 bg-white/90 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#122820]/50">
            Top Report Categories
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.topCategories.map((c) => (
              <span
                key={c.reason}
                className="rounded-full bg-[#122820]/8 px-3 py-1 text-xs font-bold text-[#122820]"
              >
                {c.reason} · {c.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reports */}
        <section className="rounded-2xl border border-[#122820]/10 bg-white/90 p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-extrabold text-[#0b1f17]">User Reports</h3>
            <div className="flex flex-wrap gap-1">
              {(['open', 'actioned', 'dismissed', 'all'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    statusFilter === s ? 'bg-[#122820] text-white' : 'bg-[#122820]/6'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <p className="text-sm text-[#122820]/60">กำลังโหลด…</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-[#122820]/60">ไม่มีรายงาน</p>
          ) : (
            <ul className="max-h-[420px] space-y-2 overflow-auto">
              {reports.map((r) => (
                <li key={r.id} className="rounded-xl border border-[#122820]/10 bg-[#f7faf8] px-3 py-2">
                  <p className="text-sm font-bold text-[#0b1f17]">
                    {r.reason}{' '}
                    <span className="text-[10px] uppercase text-[#00a86b]">{r.status}</span>
                  </p>
                  <p className="text-xs text-[#122820]/65">
                    {r.kind} · {r.targetLabel ?? r.targetId}
                  </p>
                  {r.status === 'open' ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Btn
                        disabled={busyId === r.id}
                        tone="warn"
                        label="Hide"
                        onClick={() => void actReport(r.id, 'hide')}
                      />
                      <Btn
                        disabled={busyId === r.id}
                        tone="danger"
                        label="Delete"
                        onClick={() => void actReport(r.id, 'remove')}
                      />
                      <Btn
                        disabled={busyId === r.id}
                        tone="neutral"
                        label="Dismiss"
                        onClick={() => void actReport(r.id, 'dismiss')}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Accounts */}
        <section className="rounded-2xl border border-[#122820]/10 bg-white/90 p-5 shadow-sm">
          <h3 className="mb-3 text-lg font-extrabold text-[#0b1f17]">Account Status</h3>
          <ul className="max-h-[420px] space-y-2 overflow-auto">
            {users.map((u) => (
              <li key={u.id} className="rounded-xl border border-[#122820]/10 px-3 py-2">
                <p className="text-sm font-bold text-[#0b1f17]">
                  {u.displayName}{' '}
                  <span className="text-[10px] uppercase text-amber-700">{u.status}</span>
                </p>
                <p className="text-xs text-[#122820]/60">
                  {u.handle ?? u.id} · bans {u.banCount}
                </p>
                {u.status !== 'hard_deleted' ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Btn
                      disabled={busyId === u.id}
                      tone="warn"
                      label="Soft Ban"
                      onClick={() => void onBan(u.id, 'soft')}
                    />
                    <Btn
                      disabled={busyId === u.id}
                      tone="danger"
                      label="Ban"
                      onClick={() => void onBan(u.id, 'hard')}
                    />
                    <Btn
                      disabled={busyId === u.id}
                      tone="danger"
                      label="Hard Delete"
                      onClick={() => void onHardDelete(u.id)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Flagged content + manual */}
      <section className="rounded-2xl border border-[#122820]/10 bg-white/90 p-5 shadow-sm">
        <h3 className="mb-3 text-lg font-extrabold text-[#0b1f17]">
          Flagged Content · 3-Tier Hide / Delete / Restore
        </h3>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="content id"
            className="min-w-[180px] flex-1 rounded-xl border border-[#122820]/15 px-3 py-2 text-sm"
          />
          <input
            value={manualReason}
            onChange={(e) => setManualReason(e.target.value)}
            placeholder="reason"
            className="min-w-[160px] flex-1 rounded-xl border border-[#122820]/15 px-3 py-2 text-sm"
          />
          <Btn tone="warn" label="Hide" onClick={() => void actContent(manualId.trim(), 'hide')} />
          <Btn
            tone="danger"
            label="Delete"
            onClick={() => void actContent(manualId.trim(), 'remove')}
          />
        </div>
        <ul className="max-h-[280px] space-y-2 overflow-auto">
          {content.map((c) => (
            <li
              key={c.contentId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#122820]/8 px-3 py-2"
            >
              <div>
                <p className="text-sm font-bold">
                  {c.contentId}{' '}
                  <span className="text-[10px] uppercase text-rose-600">{c.status}</span>
                  {c.auto ? <span className="ml-1 text-[10px] text-amber-600">AUTO</span> : null}
                </p>
                <p className="text-xs text-[#122820]/60">
                  {c.captionPreview ?? c.reason} · {c.actedBy}
                </p>
              </div>
              <Btn
                disabled={busyId === c.contentId}
                tone="neutral"
                label="Restore"
                onClick={() => void actContent(c.contentId, 'restore')}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#122820]/10 bg-white/90 p-5">
          <h3 className="mb-2 text-lg font-extrabold">Social Blacklist</h3>
          <ul className="max-h-48 space-y-1 overflow-auto text-xs">
            {blacklist.length === 0 ? (
              <li className="text-[#122820]/50">ว่าง</li>
            ) : (
              blacklist.map((b) => (
                <li key={b.id}>
                  {b.provider}:{b.providerUserId} · {b.reason}
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="rounded-2xl border border-[#122820]/10 bg-white/90 p-5">
          <h3 className="mb-2 text-lg font-extrabold">Audit Trail</h3>
          <ul className="max-h-48 space-y-1 overflow-auto text-xs">
            {audit.map((a) => (
              <li key={a.id}>
                {new Date(a.createdAt).toLocaleString('th-TH')} · {a.actor} · {a.action} ·{' '}
                {a.entityId}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#122820]/10 bg-white/90 px-4 py-3 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-[#122820]/50">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-[#0b1f17]">{value}</p>
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: 'warn' | 'danger' | 'neutral';
}) {
  const cls =
    tone === 'danger'
      ? 'bg-rose-600 text-white'
      : tone === 'warn'
        ? 'bg-amber-500 text-white'
        : 'border border-[#122820]/15 bg-white text-[#122820]';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 ${cls}`}
    >
      {label}
    </button>
  );
}
