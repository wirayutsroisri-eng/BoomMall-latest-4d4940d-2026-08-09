import { useEffect, useState } from 'react';
import { ToggleRow } from '../../components/ToggleRow';
import { WeightSlider } from '../../components/WeightSlider';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import {
  decideAppeal,
  decidePolicyProposal,
  fetchAppeals,
  fetchAutoMod,
  fetchPolicyProposals,
  fetchSafetyAudit,
  fetchSafetyLists,
  fetchSafetyPolicies,
  proposeSafetyPolicy,
  saveAutoMod,
  saveSafetyPolicyDraft,
  setSafetyPolicyStatus,
  addSafetyListEntry,
  type Appeal,
  type AutoMod,
  type SafetyPolicy,
} from '../../lib/safetyApi';

export function SafetyAutoModPage() {
  const [cfg, setCfg] = useState<AutoMod | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAutoMod()
      .then((r) => setCfg(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, []);

  if (!cfg) return <p className="text-[var(--ink-secondary)]">{error ?? 'กำลังโหลด…'}</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="font-display text-2xl font-extrabold">Automated Moderation</h2>
      <p className="mt-1 mb-5 text-sm text-[var(--ink-secondary)]">
        ห้าม Auto Permanent Ban จาก AI อย่างเดียว · ล็อก/ปลดล็อกอัตโนมัติอยู่ที่เมนู{' '}
        <a href="/admin/safety/algorithm" className="font-semibold text-[var(--accent)]">
          Algorithm
        </a>
      </p>
      {msg ? <p className="mb-3 text-sm text-[var(--ok)]">{msg}</p> : null}
      <div className="surface-panel px-6 py-3">
        {(
          [
            ['spamProtection', 'Spam Protection'],
            ['scamDetection', 'Scam Detection'],
            ['harassmentDetection', 'Harassment Detection'],
            ['fakeAccountDetection', 'Fake Account Detection'],
            ['botDetection', 'Bot Detection'],
            ['illegalGoodsDetection', 'Illegal Goods Detection'],
            ['repeatOffenderDetection', 'Repeat Offender Detection'],
          ] as const
        ).map(([k, label]) => (
          <WeightSlider
            key={k}
            label={label}
            value={cfg[k]}
            onChange={(v) => setCfg({ ...cfg, [k]: v })}
          />
        ))}
      </div>
      <div className="surface-panel mt-4 divide-y divide-[var(--line)] px-6">
        <ToggleRow label="Auto Flag" checked={cfg.autoFlag} onChange={(autoFlag) => setCfg({ ...cfg, autoFlag })} />
        <ToggleRow label="Auto Limit Reach" checked={cfg.autoLimitReach} onChange={(autoLimitReach) => setCfg({ ...cfg, autoLimitReach })} />
        <ToggleRow label="Auto Hide" checked={cfg.autoHide} onChange={(autoHide) => setCfg({ ...cfg, autoHide })} />
        <div className="py-3 text-sm text-[var(--warn)]">Auto Permanent Ban · ปิดถาวร (policy)</div>
      </div>
      <button
        type="button"
        className="btn-primary mt-5"
        onClick={() => {
          void saveAutoMod(cfg)
            .then(() => setMsg('บันทึกแล้ว'))
            .catch((e) => setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'));
        }}
      >
        Save
      </button>
    </div>
  );
}

export function SafetyPolicyPage() {
  const [active, setActive] = useState<SafetyPolicy | null>(null);
  const [versions, setVersions] = useState<SafetyPolicy[]>([]);
  const [prompt, setPrompt] = useState('');
  const [proposals, setProposals] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    const [p, prop] = await Promise.all([fetchSafetyPolicies(), fetchPolicyProposals()]);
    setActive(p.data.active);
    setVersions(p.data.versions);
    setProposals(prop.data);
  };

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, []);

  if (!active) return <p className="text-[var(--ink-secondary)]">{error ?? 'กำลังโหลด…'}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="font-display text-2xl font-extrabold">Policy & Algorithm</h2>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">
          Active: Safety Policy {active.version}
        </p>
      </div>
      {msg ? <p className="text-sm text-[var(--ok)]">{msg}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="surface-panel p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">Versions</p>
        <ul className="mt-3 space-y-2 text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {v.version} · <strong>{v.status}</strong>
              </span>
              <div className="flex gap-2">
                {v.status !== 'ACTIVE' ? (
                  <button
                    type="button"
                    className="btn-secondary !py-1 !text-xs"
                    onClick={() =>
                      void setSafetyPolicyStatus(v.id, 'ACTIVE')
                        .then(() => refresh())
                        .then(() => setMsg(`Published ${v.version}`))
                    }
                  >
                    Publish / Rollback
                  </button>
                ) : null}
                {v.status === 'DRAFT' ? (
                  <button
                    type="button"
                    className="btn-secondary !py-1 !text-xs"
                    onClick={() => void setSafetyPolicyStatus(v.id, 'TESTING').then(refresh)}
                  >
                    Set Testing
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="surface-panel p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">
          ต้องการให้ระบบเข้มงวดเรื่องอะไร?
        </p>
        <textarea
          className="mt-3 w-full rounded-[14px] border border-[var(--line-strong)] bg-[var(--bg)] p-3 text-sm"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="เช่น ช่วงนี้มีคนโพสต์หลอกโอนเงินนอกระบบ — ตรวจเข้มขึ้น แต่ถ้าไม่มั่นใจอย่าแบนทันที"
        />
        <button
          type="button"
          className="btn-primary mt-3"
          onClick={() => {
            void proposeSafetyPolicy(prompt)
              .then(() => refresh())
              .then(() => setMsg('สร้าง Proposed Policy แล้ว — ต้อง Approve ก่อน'))
              .catch((e) => setError(e instanceof Error ? e.message : 'ไม่สำเร็จ'));
          }}
        >
          สร้าง Proposed Policy
        </button>
      </div>

      {proposals.length > 0 ? (
        <div className="surface-panel p-5 space-y-3">
          <p className="font-semibold">Pending Proposals</p>
          {proposals.map((p) => {
            const row = p as {
              id: string;
              prompt: string;
              expectedImpact: string;
              risk: string;
              proposed?: { version?: string };
            };
            return (
              <div key={row.id} className="rounded-[14px] bg-[var(--bg)] p-4 text-sm">
                <p className="font-bold">{row.proposed?.version}</p>
                <p className="mt-1 text-[var(--ink-secondary)]">{row.prompt}</p>
                <p className="mt-2 text-xs">Impact: {row.expectedImpact}</p>
                <p className="text-xs">Risk: {row.risk}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary !text-xs"
                    onClick={() =>
                      void decidePolicyProposal(row.id, 'approved').then(refresh).then(() => setMsg('Approved → Draft'))
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary !text-xs"
                    onClick={() => void decidePolicyProposal(row.id, 'rejected').then(refresh)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          const next = bump(active.version);
          void saveSafetyPolicyDraft({
            version: next,
            instruction: active.instruction,
            thresholds: active.thresholds,
            weights: active.weights,
          })
            .then(refresh)
            .then(() => setMsg(`Saved draft ${next}`));
        }}
      >
        Save Draft Copy
      </button>
    </div>
  );
}

export function SafetyBlacklistPage() {
  const [rows, setRows] = useState<unknown[]>([]);
  const [kind, setKind] = useState('BLOCKLIST');
  const [type, setType] = useState('keyword');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    fetchSafetyLists()
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold">Blacklist / Watchlist</h2>
      <p className="mt-1 mb-5 text-sm text-[var(--ink-secondary)]">
        Watchlist = ตรวจเพิ่ม · ไม่ block ทันที
      </p>
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="surface-panel mb-5 grid gap-2 p-4 sm:grid-cols-2">
        <select className="rounded-xl border px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="BLOCKLIST">BLOCKLIST</option>
          <option value="WATCHLIST">WATCHLIST</option>
        </select>
        <select className="rounded-xl border px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="keyword">keyword</option>
          <option value="url">url</option>
          <option value="domain">domain</option>
          <option value="phone_pattern">phone_pattern</option>
          <option value="product_keyword">product_keyword</option>
          <option value="user">user</option>
        </select>
        <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
        <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button
          type="button"
          className="btn-primary sm:col-span-2"
          onClick={() =>
            void addSafetyListEntry({ kind, type, value, reason })
              .then(refresh)
              .then(() => {
                setValue('');
                setReason('');
              })
          }
        >
          Add
        </button>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const row = r as { id: string; kind: string; type: string; value: string; reason: string };
          return (
            <li key={row.id} className="surface-panel px-4 py-3 text-sm">
              <strong>{row.kind}</strong> · {row.type} · {row.value}
              <p className="text-xs text-[var(--ink-tertiary)]">{row.reason}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SafetyAppealsPage() {
  const [rows, setRows] = useState<Appeal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    fetchAppeals('PENDING')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold">Appeals</h2>
      <p className="mt-1 mb-5 text-sm text-[var(--ink-secondary)]">
        Uphold · Modify · Reverse · Escalate
      </p>
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {rows.length === 0 ? (
        <div className="surface-panel p-8 text-[var(--ink-secondary)]">ไม่มี Appeal ที่รอ</div>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <article key={a.id} className="surface-panel p-5">
              <p className="text-xs font-bold text-[var(--ink-tertiary)]">{a.targetType}</p>
              <h3 className="font-display mt-1 text-lg font-extrabold">{a.userId}</h3>
              <p className="mt-2 text-sm">{a.appealText}</p>
              <p className="mt-2 text-xs text-[var(--ink-tertiary)]">
                Original: {a.originalAction} · {a.originalReason}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(['UPHELD', 'MODIFIED', 'REVERSED', 'ESCALATED'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="btn-secondary !text-xs"
                    onClick={() => void decideAppeal(a.id, d).then(refresh)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function SafetyAuditPage() {
  const [rows, setRows] = useState<unknown[]>([]);
  const [admin, setAdmin] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    void fetchSafetyAudit({ admin: admin || undefined, action: action || undefined }).then((r) =>
      setRows(r.data),
    );
  }, [admin, action]);

  return (
    <div>
      <PageHeader
        eyebrow="ระบบ"
        title="บันทึกการทำงาน"
        description="อ่านอย่างเดียว — ใครทำอะไร กับใคร เมื่อไร ไม่สามารถแก้หรือลบจากหน้านี้"
        helpKey="audit"
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="rounded-xl border px-3 py-2 text-sm"
          placeholder="กรองผู้ทำ"
          value={admin}
          onChange={(e) => setAdmin(e.target.value)}
        />
        <input
          className="rounded-xl border px-3 py-2 text-sm"
          placeholder="กรองการกระทำ"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีบันทึกในช่วงนี้"
          description="เมื่อแอดมินระงับบัญชี คืนเงิน หรือตรวจเคส รายการจะขึ้นที่นี่เพื่อไล่ย้อนหลัง"
        />
      ) : (
      <div className="surface-panel overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] text-[var(--ink-tertiary)]">
            <tr>
              <th className="px-4 py-3">เวลา</th>
              <th className="px-4 py-3">ผู้ทำ</th>
              <th className="px-4 py-3">การกระทำ</th>
              <th className="px-4 py-3">เป้าหมาย</th>
              <th className="px-4 py-3">ก่อน → หลัง</th>
              <th className="px-4 py-3">เหตุผล</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const row = r as {
                id: string;
                time: string;
                admin: string;
                action: string;
                targetType: string;
                targetId: string;
                previousState?: string;
                newState?: string;
                reason: string;
                policyVersion?: string;
              };
              return (
                <tr key={row.id} className="border-b border-[var(--line)]">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(row.time).toLocaleString('th-TH')}
                  </td>
                  <td className="px-4 py-3">{row.admin}</td>
                  <td className="px-4 py-3">{row.action}</td>
                  <td className="px-4 py-3">
                    {row.targetType}:{row.targetId}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--ink-secondary)]">
                    {row.previousState || row.newState
                      ? `${row.previousState ?? '—'} → ${row.newState ?? '—'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">
                    {row.reason}
                    {row.policyVersion ? ` · ${row.policyVersion}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function bump(v: string) {
  const m = v.match(/v(\d+)\.(\d+)/);
  if (!m) return 'v1.1';
  return `v${m[1]}.${Number(m[2]) + 1}`;
}
