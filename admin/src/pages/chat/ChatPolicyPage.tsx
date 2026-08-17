import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ToggleRow } from '../../components/ToggleRow';
import { WeightSlider } from '../../components/WeightSlider';
import {
  fetchChatPolicies,
  rollbackChatPolicy,
  saveChatPolicyDraft,
  setChatPolicyStatus,
  type ChatPolicy,
} from '../../lib/chatApi';

export function ChatPolicyPage() {
  const [active, setActive] = useState<ChatPolicy | null>(null);
  const [versions, setVersions] = useState<ChatPolicy[]>([]);
  const [draft, setDraft] = useState<ChatPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchChatPolicies();
      setActive(res.data.active);
      setVersions(res.data.versions);
      const existingDraft = res.data.versions.find((p) => p.status === 'draft');
      setDraft(
        existingDraft ?? {
          ...res.data.active,
          id: 'local-draft',
          version: nextVersion(res.data.active.version),
          status: 'draft',
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลด Policy ไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!draft) {
    return <p className="text-[var(--ink-secondary)]">กำลังโหลด Policy…</p>;
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await saveChatPolicyDraft({
        version: draft.version,
        sensitivity: draft.sensitivity,
        detections: draft.detections,
        antiSpam: draft.antiSpam,
        riskThresholds: draft.riskThresholds,
        policyPrompt: draft.policyPrompt,
      });
      setStatus(`บันทึก Draft ${res.data.version}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const publish = async (policyId: string, next: 'test' | 'active') => {
    setBusy(true);
    setError(null);
    try {
      await setChatPolicyStatus(policyId, next);
      setStatus(next === 'active' ? 'Publish เป็น Active แล้ว' : 'ตั้งเป็น Test แล้ว');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="แชต · นโยบาย"
        title="ควบคุมนโยบายแชต"
        description="ปรับความไวและการตรวจจับแบบ Control Panel — มี Version / Draft / Test / Active / Rollback"
      />

      {error ? (
        <div className="mb-4 rounded-[14px] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="mb-4 rounded-[14px] bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]">
          {status}
        </div>
      ) : null}

      <div className="surface-panel mb-5 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          Current Version
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="status-pill ok">Active</span>
          <p className="font-display text-xl font-extrabold">
            Chat Policy {active?.version ?? '—'}
          </p>
        </div>
        <div className="mt-4 space-y-2">
          {versions.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {v.version} · <strong>{v.status}</strong>
              </span>
              <div className="flex gap-2">
                {v.status !== 'active' ? (
                  <button
                    type="button"
                    className="btn-secondary !py-1 !text-xs"
                    disabled={busy}
                    onClick={() => void publish(v.id, 'active')}
                  >
                    Rollback / Activate
                  </button>
                ) : null}
                {v.status === 'draft' ? (
                  <button
                    type="button"
                    className="btn-secondary !py-1 !text-xs"
                    disabled={busy}
                    onClick={() => void publish(v.id, 'test')}
                  >
                    Set Test
                  </button>
                ) : null}
                {v.status === 'archived' ? (
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    disabled={busy}
                    onClick={() => void rollbackChatPolicy(v.id).then(refresh)}
                  >
                    Rollback
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="border-b border-[var(--line)] px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
            Sensitivity
          </p>
          <h2 className="font-display mt-1 text-xl font-extrabold">Draft {draft.version}</h2>
        </div>
        <div className="px-6 py-2">
          <WeightSlider
            label="Spam Sensitivity"
            value={draft.sensitivity.spam}
            onChange={(spam) =>
              setDraft({ ...draft, sensitivity: { ...draft.sensitivity, spam } })
            }
          />
          <WeightSlider
            label="Scam Sensitivity"
            value={draft.sensitivity.scam}
            onChange={(scam) =>
              setDraft({ ...draft, sensitivity: { ...draft.sensitivity, scam } })
            }
          />
          <WeightSlider
            label="Harassment Sensitivity"
            value={draft.sensitivity.harassment}
            onChange={(harassment) =>
              setDraft({ ...draft, sensitivity: { ...draft.sensitivity, harassment } })
            }
          />
        </div>
      </div>

      <div className="surface-panel mt-5 overflow-hidden">
        <div className="border-b border-[var(--line)] px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
            Detections
          </p>
        </div>
        <div className="divide-y divide-[var(--line)] px-6">
          {(
            [
              ['externalPaymentScam', 'External Payment Scam Detection'],
              ['repeatedMessage', 'Repeated Message Detection'],
              ['massMessaging', 'Mass Messaging Detection'],
              ['botDetection', 'Bot Detection'],
              ['linkSpam', 'Link Spam'],
              ['phoneSpam', 'Phone Spam'],
            ] as const
          ).map(([key, label]) => (
            <ToggleRow
              key={key}
              label={label}
              checked={draft.detections[key]}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  detections: { ...draft.detections, [key]: v },
                })
              }
            />
          ))}
        </div>
      </div>

      <div className="surface-panel mt-5 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          Action Thresholds
        </p>
        <ul className="mt-3 space-y-1 text-sm text-[var(--ink-secondary)]">
          <li>0–{draft.riskThresholds.allowMax} → ALLOW</li>
          <li>
            {draft.riskThresholds.allowMax + 1}–{draft.riskThresholds.flagMax} → FLAG
          </li>
          <li>
            {draft.riskThresholds.flagMax + 1}–{draft.riskThresholds.limitMax} → LIMIT
          </li>
          <li>
            {draft.riskThresholds.limitMax + 1}–{draft.riskThresholds.tempRestrictMax} → TEMP_RESTRICT
          </li>
          <li>{draft.riskThresholds.tempRestrictMax + 1}+ → HOLD + HUMAN REVIEW</li>
        </ul>
        <p className="mt-3 text-sm font-semibold text-[var(--warn)]">
          ห้าม Ban จาก AI Prompt / risk score เพียงอย่างเดียว
        </p>
      </div>

      <div className="surface-panel mt-5 p-6">
        <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          Policy Prompt
          <textarea
            className="mt-2 w-full rounded-[14px] border border-[var(--line-strong)] bg-[var(--bg)] p-3 text-sm leading-relaxed text-[var(--ink)]"
            rows={4}
            value={draft.policyPrompt}
            onChange={(e) => setDraft({ ...draft, policyPrompt: e.target.value })}
          />
        </label>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save()}>
            Save Draft
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void save().then(() => refresh())}
          >
            Save & Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function nextVersion(v: string) {
  const m = v.match(/v(\d+)\.(\d+)/);
  if (!m) return 'v1.1';
  return `v${m[1]}.${Number(m[2]) + 1}`;
}
