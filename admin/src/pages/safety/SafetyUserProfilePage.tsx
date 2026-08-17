import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ToggleRow } from '../../components/ToggleRow';
import {
  fetchUserSafetyProfile,
  updateUserCapabilities,
} from '../../lib/safetyApi';

const CAPS = [
  'POST',
  'COMMENT',
  'MESSAGE',
  'SELL',
  'BUY',
  'LIVE',
  'ADVERTISE',
  'AFFILIATE',
  'JOB',
  'UPLOAD_MEDIA',
] as const;

export function SafetyUserProfilePage() {
  const { userId = '' } = useParams();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [caps, setCaps] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetchUserSafetyProfile(userId);
      setData(res.data);
      const r = res.data.restrictions as { capabilities?: Record<string, boolean> } | undefined;
      setCaps(r?.capabilities ?? Object.fromEntries(CAPS.map((c) => [c, true])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดโปรไฟล์ไม่สำเร็จ');
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const user = (data?.user ?? {}) as { displayName?: string; status?: string; id?: string };
  const risk = (data?.risk ?? {}) as {
    score?: number;
    band?: string;
    signals?: Array<{ signal: string; contribution: number }>;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/safety/users" className="text-sm font-semibold text-[var(--accent)]">
        ← Users
      </Link>
      <h2 className="font-display mt-3 text-2xl font-extrabold tracking-tight">
        {user.displayName ?? userId}
      </h2>
      <p className="mt-1 text-sm text-[var(--ink-secondary)]">
        Status {user.status ?? '—'} · Risk {risk.band ?? '—'} ({risk.score ?? '—'})
      </p>
      <p className="mt-2 text-xs text-[var(--ink-tertiary)]">
        Score from:{' '}
        {risk.signals?.length
          ? risk.signals.map((s) => `${s.signal}(+${s.contribution})`).join(', ')
          : '—'}
      </p>

      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="mt-3 text-sm text-[var(--ok)]">{msg}</p> : null}

      <div className="surface-panel mt-6 divide-y divide-[var(--line)] px-6">
        <p className="py-4 text-sm font-bold">Capability Restrictions</p>
        {CAPS.map((c) => (
          <ToggleRow
            key={c}
            label={c}
            checked={Boolean(caps[c])}
            onChange={(v) => setCaps({ ...caps, [c]: v })}
          />
        ))}
        <label className="block py-4 text-sm">
          Reason
          <input
            className="mt-1 w-full rounded-xl border border-[var(--line-strong)] px-3 py-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="py-4">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void updateUserCapabilities(userId, caps, reason)
                .then(() => {
                  setMsg('อัปเดต restrictions แล้ว');
                  return refresh();
                })
                .catch((e) => setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'));
            }}
          >
            Save Restrictions
          </button>
        </div>
      </div>

      <details className="surface-panel mt-5 p-5">
        <summary className="cursor-pointer font-semibold">Advanced · Raw profile</summary>
        <pre className="mt-3 overflow-auto text-xs text-[var(--ink-tertiary)]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
