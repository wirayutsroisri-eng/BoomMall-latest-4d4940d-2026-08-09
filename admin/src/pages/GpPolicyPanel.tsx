import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ToggleRow } from '../components/ToggleRow';
import { WeightSlider } from '../components/WeightSlider';
import {
  fetchGpAudit,
  fetchGpPolicy,
  saveGpPolicy,
  type CommerceSellerRow,
  type GpAuditRow,
  type GpPolicy,
  type MerchantGpOverride,
} from '../lib/api';
import { useAdminAuth } from '../auth/AdminAuthContext';

function bpsToPct(bps: number) {
  return Math.round(bps) / 100;
}

function pctToBps(pct: number) {
  return Math.round(pct * 100);
}

function money(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

type Props = {
  sellers: CommerceSellerRow[];
  embedded?: boolean;
};

export function GpPolicyPanel({ sellers, embedded }: Props) {
  const { session } = useAdminAuth();
  const canWrite = Boolean(session?.permissions.gpWrite);
  const [policy, setPolicy] = useState<GpPolicy | null>(null);
  const [audits, setAudits] = useState<GpAuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewAmount, setPreviewAmount] = useState(1000);
  const [overrideMerchant, setOverrideMerchant] = useState('');
  const [overridePct, setOverridePct] = useState('3');

  const load = useCallback(async () => {
    setError(null);
    const [p, a] = await Promise.all([
      fetchGpPolicy(),
      fetchGpAudit(20).catch(() => ({ data: [] as GpAuditRow[] })),
    ]);
    setPolicy(p.data);
    setAudits(a.data);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'โหลด GP ไม่สำเร็จ'));
  }, [load]);

  const preview = useMemo(() => {
    if (!policy) return null;
    const amount = Math.max(0, previewAmount);
    const bps = !policy.enabled || amount < policy.minOrderThb ? 0 : policy.defaultGpBps;
    const gp = Math.floor((amount * bps) / 10_000);
    return { bps, gp, net: amount - gp };
  }, [policy, previewAmount]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!policy || !canWrite) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const saved = await saveGpPolicy({
        enabled: policy.enabled,
        defaultGpBps: policy.defaultGpBps,
        b2cGpBps: policy.b2cGpBps,
        b2bGpBps: policy.b2bGpBps,
        minOrderThb: policy.minOrderThb,
        holdDaysAfterComplete: policy.holdDaysAfterComplete,
        payoutCycleDays: policy.payoutCycleDays,
        merchantOverrides: policy.merchantOverrides,
      });
      setPolicy(saved.data);
      setMsg('บันทึกอัตรา GP แล้ว — ออเดอร์ที่จ่ายถัดไปจะหักตามนี้');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  function addOverride() {
    if (!policy || !overrideMerchant) return;
    const seller = sellers.find((s) => s.merchantId === overrideMerchant);
    const next: MerchantGpOverride = {
      merchantId: overrideMerchant,
      shopName: seller?.shopName,
      gpBps: pctToBps(Number(overridePct) || 0),
    };
    setPolicy({
      ...policy,
      merchantOverrides: [
        ...policy.merchantOverrides.filter((o) => o.merchantId !== next.merchantId),
        next,
      ],
    });
  }

  if (!policy) {
    return error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null;
  }

  return (
    <form onSubmit={onSave} className={embedded ? 'space-y-5' : 'surface-panel space-y-5 p-5'}>
      <div>
        {embedded ? (
          <h3 className="text-[15px] font-semibold">อัตรา GP มาตรฐาน</h3>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
              Marketplace GP
            </p>
            <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight">หักค่า GP จากผู้ขาย</h2>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">
              ตั้งอัตราหัก GP ตอนออเดอร์ชำระ — เรทมาตรฐานหรือเฉพาะร้าน
            </p>
          </>
        )}
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}

      <ToggleRow
        checked={policy.enabled}
        onChange={(enabled) => canWrite && setPolicy({ ...policy, enabled })}
        label="เปิดหัก GP"
        hint="ปิดแล้วออเดอร์ใหม่จะไม่หัก (ร้านได้เต็มยอดสินค้า)"
      />

      <WeightSlider
        label={`อัตรามาตรฐาน (${bpsToPct(policy.defaultGpBps)}%)`}
        value={Math.round(bpsToPct(policy.defaultGpBps))}
        max={30}
        onChange={(pct) => canWrite && setPolicy({ ...policy, defaultGpBps: pctToBps(pct) })}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--ink-tertiary)]">B2C %</span>
          <input
            className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2"
            type="number"
            min={0}
            max={50}
            step={0.1}
            placeholder="ใช้มาตรฐาน"
            value={policy.b2cGpBps == null ? '' : String(bpsToPct(policy.b2cGpBps))}
            onChange={(e) =>
              setPolicy({
                ...policy,
                b2cGpBps: e.target.value === '' ? null : pctToBps(Number(e.target.value)),
              })
            }
            disabled={!canWrite}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--ink-tertiary)]">B2B %</span>
          <input
            className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2"
            type="number"
            min={0}
            max={50}
            step={0.1}
            placeholder="ใช้มาตรฐาน"
            value={policy.b2bGpBps == null ? '' : String(bpsToPct(policy.b2bGpBps))}
            onChange={(e) =>
              setPolicy({
                ...policy,
                b2bGpBps: e.target.value === '' ? null : pctToBps(Number(e.target.value)),
              })
            }
            disabled={!canWrite}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--ink-tertiary)]">
            ยอดขั้นต่ำที่เริ่มหัก (บาท)
          </span>
          <input
            className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2"
            type="number"
            min={0}
            step={1}
            value={policy.minOrderThb}
            onChange={(e) => setPolicy({ ...policy, minOrderThb: Math.max(0, Number(e.target.value) || 0) })}
            disabled={!canWrite}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--ink-tertiary)]">
            พักยอดหลังตกลง (วัน)
          </span>
          <input
            className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2"
            type="number"
            min={0}
            max={30}
            value={policy.holdDaysAfterComplete ?? 7}
            onChange={(e) =>
              setPolicy({ ...policy, holdDaysAfterComplete: Math.max(0, Number(e.target.value) || 0) })
            }
            disabled={!canWrite}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-bold uppercase text-[var(--ink-tertiary)]">
            รอบจ่ายร้าน (วัน)
          </span>
          <input
            className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2"
            type="number"
            min={1}
            max={30}
            value={policy.payoutCycleDays ?? 7}
            onChange={(e) =>
              setPolicy({ ...policy, payoutCycleDays: Math.max(1, Number(e.target.value) || 7) })
            }
            disabled={!canWrite}
          />
        </label>
      </div>

      <div className="rounded-xl border border-[var(--line)] p-4">
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">ตัวอย่างคำนวณ (อัตรามาตรฐาน)</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--ink-tertiary)]">ยอดสินค้า</span>
            <input
              className="w-36 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2"
              type="number"
              min={0}
              value={previewAmount}
              onChange={(e) => setPreviewAmount(Number(e.target.value) || 0)}
            />
          </label>
          {preview ? (
            <p className="text-sm text-[var(--ink-secondary)]">
              หัก GP {money(preview.gp)} ({bpsToPct(preview.bps)}%) · ร้านได้ {money(preview.net)}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">ยกเว้น / เรทเฉพาะร้าน</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            value={overrideMerchant}
            onChange={(e) => setOverrideMerchant(e.target.value)}
            disabled={!canWrite}
          >
            <option value="">เลือกร้าน</option>
            {sellers.map((s) => (
              <option key={s.merchantId} value={s.merchantId}>
                {s.shopName} ({s.merchantId})
              </option>
            ))}
          </select>
          <input
            className="w-24 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            type="number"
            min={0}
            max={50}
            step={0.1}
            value={overridePct}
            onChange={(e) => setOverridePct(e.target.value)}
            disabled={!canWrite}
          />
          <button
            type="button"
            className="btn-secondary !py-2 !text-sm"
            onClick={addOverride}
            disabled={!canWrite}
          >
            เพิ่มเรทร้าน
          </button>
        </div>
        {policy.merchantOverrides.length ? (
          <ul className="mt-3 divide-y divide-[var(--line)] text-sm">
            {policy.merchantOverrides.map((row) => (
              <li key={row.merchantId} className="flex items-center justify-between py-2">
                <span>
                  {row.shopName || row.merchantId} · {bpsToPct(row.gpBps)}%
                </span>
                {canWrite ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--danger)]"
                    onClick={() =>
                      setPolicy({
                        ...policy,
                        merchantOverrides: policy.merchantOverrides.filter((o) => o.merchantId !== row.merchantId),
                      })
                    }
                  >
                    ลบ
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-tertiary)]">ยังไม่มีเรทเฉพาะร้าน</p>
        )}
      </div>

      {canWrite ? (
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกอัตรา GP'}
        </button>
      ) : (
        <p className="text-sm text-[var(--ink-tertiary)]">ดูได้อย่างเดียว — แผนก Marketplace / Finance / Admin แก้เรทได้</p>
      )}

      {policy.updatedBy ? (
        <p className="text-xs text-[var(--ink-tertiary)]">
          อัปเดตล่าสุด {new Date(policy.updatedAt).toLocaleString('th-TH')} โดย {policy.updatedBy}
        </p>
      ) : null}

      {audits.length ? (
        <div>
          <p className="text-xs font-bold uppercase text-[var(--ink-tertiary)]">บันทึก GP ล่าสุด</p>
          <ul className="mt-2 divide-y divide-[var(--line)] text-sm">
            {audits.slice(0, 8).map((row) => (
              <li key={row.id} className="py-2">
                <span className="font-semibold">{row.action}</span>
                {row.gpAmountThb ? ` · หัก ฿${Number(row.gpAmountThb).toLocaleString('th-TH')}` : ''}
                {row.gpBps != null ? ` · ${bpsToPct(row.gpBps)}%` : ''}
                <span className="block text-xs text-[var(--ink-tertiary)]">
                  {new Date(row.createdAt).toLocaleString('th-TH')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
