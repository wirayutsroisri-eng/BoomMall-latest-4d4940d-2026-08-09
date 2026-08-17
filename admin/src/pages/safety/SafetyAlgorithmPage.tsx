import { useCallback, useEffect, useState } from 'react';
import { ToggleRow } from '../../components/ToggleRow';
import { WeightSlider } from '../../components/WeightSlider';
import {
  fetchAlgorithmDirectives,
  fetchAlgorithmRuns,
  fetchAlgorithmStatus,
  fetchAutoMod,
  postAlgorithmDirective,
  runSafetyAlgorithm,
  saveAutoMod,
  type AlgorithmStatus,
  type AutoMod,
} from '../../lib/safetyApi';

const SUGGESTIONS = [
  'ช่วงนี้มีคนหลอกโอนเงินนอกระบบเยอะ ให้ล็อกชั่วคราวอัตโนมัติเมื่อมีรายงาน แต่ห้ามแบนถาวร',
  'ผ่อนเกณฑ์ลงหน่อย ปลดล็อกอัตโนมัติเมื่อครบ 12 ชม. ถ้าความเสี่ยงลด',
  'เปิดล็อกอัตโนมัติสำหรับสแปม และปลดเองหลัง 24 ชม.',
  'ปิดล็อกอัตโนมัติชั่วคราว — แอดมินจะตรวจเอง',
];

export function SafetyAlgorithmPage() {
  const [status, setStatus] = useState<AlgorithmStatus | null>(null);
  const [cfg, setCfg] = useState<AutoMod | null>(null);
  const [chat, setChat] = useState('');
  const [directives, setDirectives] = useState<unknown[]>([]);
  const [runs, setRuns] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [s, d, r, a] = await Promise.all([
      fetchAlgorithmStatus(),
      fetchAlgorithmDirectives(),
      fetchAlgorithmRuns(),
      fetchAutoMod(),
    ]);
    setStatus(s.data);
    setDirectives(d.data);
    setRuns(r.data);
    setCfg(a.data);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, [refresh]);

  const send = async () => {
    if (!chat.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await postAlgorithmDirective(chat.trim());
      setChat('');
      setMsg('ระบบรับแนวทางแล้ว และรันอัลกอริทึมล็อก/ปลดล็อกให้อัตโนมัติ');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  if (!cfg || !status) {
    return <p className="text-[var(--ink-secondary)]">{error ?? 'กำลังโหลด…'}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight">
          Algorithm · ล็อก / ปลดล็อกอัตโนมัติ
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-secondary)]">
          แอดมินแค่พิมพ์แนวทาง — ระบบล็อกชั่วคราว/ปลดล็อกเองเมื่อมีรายงานจากผู้ใช้
          (App Store 1.2) · ห้ามแบนถาวรหรือ Hard Delete โดยอัลกอริทึม
        </p>
      </div>

      {msg ? <p className="text-sm font-medium text-[var(--ok)]">{msg}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="surface-panel p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
          สถานะระบบ
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`status-pill ${cfg.autoSoftLock ? 'ok' : 'warn'}`}>
            Auto Lock {cfg.autoSoftLock ? 'ON' : 'OFF'}
          </span>
          <span className={`status-pill ${cfg.autoUnlock ? 'ok' : 'warn'}`}>
            Auto Unlock {cfg.autoUnlock ? 'ON' : 'OFF'}
          </span>
          <span className="status-pill ok">Permanent Ban · ปิดถาวร</span>
        </div>
        <p className="mt-3 text-sm text-[var(--ink-secondary)]">
          ล็อกเมื่อ risk ≥ {cfg.softLockRiskMin ?? 65} · ปลดเมื่อ risk ≤ {cfg.unlockRiskMax ?? 35}{' '}
          หรือครบ {cfg.softLockHours ?? 24} ชม.
        </p>
        <p className="mt-2 rounded-[12px] bg-[var(--bg)] px-3 py-2 text-sm">
          แนวทางปัจจุบัน: {cfg.activeDirective || '—'}
        </p>
        {status.activePolicy?.parsedRules ? (
          <pre className="mt-2 overflow-auto rounded-[12px] bg-[var(--bg)] px-3 py-2 text-[11px] text-[var(--ink-secondary)]">
            {JSON.stringify(status.activePolicy.parsedRules, null, 2)}
          </pre>
        ) : null}
        {(status.moderationStates?.length ?? 0) > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-[var(--ink-secondary)]">
            {status.moderationStates!.slice(0, 8).map((s) => (
              <li key={s.targetId}>
                {s.targetType} {s.targetId} · {s.status} · risk {s.currentRiskScore.toFixed?.(0) ?? s.currentRiskScore}
                {s.autoUnlockAt ? ` · unlock ${new Date(s.autoUnlockAt).toLocaleString('th-TH')}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Admin chat */}
      <div className="surface-panel overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
            สั่งงานด้วยแชท
          </p>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            พิมพ์ภาษาไทยได้เลย — ไม่ต้องมานั่งล็อก/ปลดทีละคน
          </p>
        </div>
        <div className="max-h-56 space-y-2 overflow-auto px-5 py-4">
          {directives.length === 0 ? (
            <p className="text-sm text-[var(--ink-tertiary)]">ยังไม่มีคำสั่ง — ลองเลือกตัวอย่างด้านล่าง</p>
          ) : (
            directives.map((d) => {
              const row = d as { id: string; text: string; actor: string; createdAt: string };
              return (
                <div key={row.id} className="rounded-[14px] bg-[var(--bg)] px-3 py-2 text-sm">
                  <p className="font-medium text-[var(--ink)]">{row.text}</p>
                  <p className="mt-1 text-[11px] text-[var(--ink-tertiary)]">
                    {row.actor} · {new Date(row.createdAt).toLocaleString('th-TH')}
                  </p>
                </div>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-5 py-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full bg-[var(--bg)] px-3 py-1.5 text-left text-xs font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)]"
              onClick={() => setChat(s)}
            >
              {s.slice(0, 42)}…
            </button>
          ))}
        </div>
        <div className="flex gap-2 border-t border-[var(--line)] p-4">
          <textarea
            className="min-h-[72px] flex-1 rounded-[14px] border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2 text-sm"
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            placeholder="เช่น ช่วงนี้หลอกโอนเงินเยอะ ให้ล็อกชั่วคราวอัตโนมัติเมื่อมีรายงาน แต่ห้ามแบนถาวร"
          />
          <button type="button" className="btn-primary self-end" disabled={busy || !chat.trim()} onClick={() => void send()}>
            ส่งแนวทาง
          </button>
        </div>
      </div>

      {/* Sliders */}
      <div className="surface-panel px-6 py-3">
        <p className="pt-3 text-xs font-bold uppercase text-[var(--ink-tertiary)]">เกณฑ์อัลกอริทึม</p>
        <WeightSlider
          label="Soft Lock เมื่อ Risk ≥"
          value={cfg.softLockRiskMin ?? 65}
          onChange={(softLockRiskMin) => setCfg({ ...cfg, softLockRiskMin })}
        />
        <WeightSlider
          label="Unlock เมื่อ Risk ≤"
          value={cfg.unlockRiskMax ?? 35}
          onChange={(unlockRiskMax) => setCfg({ ...cfg, unlockRiskMax })}
        />
        <WeightSlider
          label="ปลดล็อกหลัง (ชม.)"
          value={cfg.softLockHours ?? 24}
          max={168}
          onChange={(softLockHours) => setCfg({ ...cfg, softLockHours })}
        />
      </div>
      <div className="surface-panel divide-y divide-[var(--line)] px-6">
        <ToggleRow
          label="Auto Soft Lock"
          hint="ล็อกชั่วคราวเมื่อมีรายงาน + risk สูง"
          checked={Boolean(cfg.autoSoftLock)}
          onChange={(autoSoftLock) => setCfg({ ...cfg, autoSoftLock })}
        />
        <ToggleRow
          label="Auto Unlock"
          hint="ปลดเองเมื่อครบเวลาหรือ risk ลด"
          checked={Boolean(cfg.autoUnlock)}
          onChange={(autoUnlock) => setCfg({ ...cfg, autoUnlock })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            void saveAutoMod(cfg)
              .then(() => setMsg('บันทึกเกณฑ์แล้ว'))
              .then(() => refresh())
              .catch((e) => setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'));
          }}
        >
          บันทึกเกณฑ์
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void runSafetyAlgorithm()
              .then(() => setMsg('รันอัลกอริทึมแล้ว'))
              .then(() => refresh())
              .catch((e) => setError(e instanceof Error ? e.message : 'รันไม่สำเร็จ'))
              .finally(() => setBusy(false));
          }}
        >
          รันล็อก/ปลดล็อกตอนนี้
        </button>
      </div>

      <div className="surface-panel p-5">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">ผลรันล่าสุด</p>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-tertiary)]">ยังไม่มีการรัน</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {runs.slice(0, 5).map((r) => {
              const row = r as {
                id: string;
                at: string;
                locked: unknown[];
                unlocked: unknown[];
              };
              return (
                <li key={row.id} className="rounded-[12px] bg-[var(--bg)] px-3 py-2">
                  {new Date(row.at).toLocaleString('th-TH')} · ล็อก {row.locked.length} · ปลด{' '}
                  {row.unlocked.length}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
