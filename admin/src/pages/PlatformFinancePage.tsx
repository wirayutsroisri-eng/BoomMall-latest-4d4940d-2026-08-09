import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchAccountingPack,
  fetchCommerceSellers,
  fetchEscrowLedger,
  fetchFinanceSettings,
  markEscrowPayout,
  saveFinanceSettings,
  type AccountingPack,
  type CommerceSellerRow,
  type EscrowLedgerRow,
  type PlatformBankAccount,
  type PlatformFinanceSettings,
} from '../lib/api';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { BalanceDashboard } from './BalanceDashboard';
import { GpPolicyPanel } from './GpPolicyPanel';
import { TaxReportsPanel } from './TaxReportsPanel';
import { WithdrawalsQueuePanel } from './WithdrawalsQueuePanel';
import { HelpPopover } from '../components/HelpPopover';
import { TermTip } from '../components/TermTip';

function money(n: number) {
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

const THAI_BANKS = [
  { code: '004', name: 'ธนาคารกสิกรไทย' },
  { code: '014', name: 'ธนาคารไทยพาณิชย์' },
  { code: '002', name: 'ธนาคารกรุงเทพ' },
  { code: '006', name: 'ธนาคารกรุงไทย' },
  { code: '025', name: 'ธนาคารกรุงศรีอยุธยา' },
  { code: '011', name: 'ธนาคารทหารไทยธนชาต' },
  { code: '030', name: 'ธนาคารออมสิน' },
  { code: '034', name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร' },
  { code: '069', name: 'ธนาคารเกียรตินาคินภัทร' },
  { code: '022', name: 'ธนาคารซีไอเอ็มบี ไทย' },
];

const EMPTY_BANK: PlatformBankAccount = {
  bankName: '',
  bankAccountNo: '',
  bankAccountName: '',
  bankCode: '',
};

function downloadAccountingCsv(pack: AccountingPack) {
  const bank = pack.receivingAccount;
  const rows = [
    [pack.title],
    ['วันที่ออกรายงาน', new Date(pack.generatedAt).toLocaleString('th-TH')],
    ['สกุลเงิน', pack.currency],
    ['ธนาคารรับเงิน', bank.bankName ?? ''],
    ['ชื่อบัญชี', bank.bankAccountName ?? ''],
    ['เลขบัญชี', bank.bankAccountNo ?? ''],
    ['อัตรา GP มาตรฐาน (%)', String(pack.escrowRules.defaultGpPercent)],
    ['จำนวนวัน Hold', String(pack.escrowRules.autoCompleteDays)],
    ['ออเดอร์ใน escrow', String(pack.counts.ordersInEscrow)],
    ['คำขอถอนค้าง', String(pack.counts.pendingWithdrawals)],
    [],
    ['รหัส', 'รายการ', 'จำนวนเงิน (บาท)'],
    ...pack.lines.map((l) => [l.code, l.label, String(l.amount)]),
    [],
    ['หมายเหตุ', pack.note],
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `boommall-accounting-${pack.generatedAt.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlatformFinancePage() {
  const { session } = useAdminAuth();
  const canWrite = Boolean(session?.permissions.gpWrite);
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [page, setPage] = useState<'overview' | 'reports' | 'settings'>('overview');
  const [sellers, setSellers] = useState<CommerceSellerRow[]>([]);
  const [rows, setRows] = useState<EscrowLedgerRow[]>([]);
  const [settings, setSettings] = useState<PlatformFinanceSettings | null>(null);
  const [pack, setPack] = useState<AccountingPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [payoutRow, setPayoutRow] = useState<EscrowLedgerRow | null>(null);
  const [slipRow, setSlipRow] = useState<EscrowLedgerRow | null>(null);
  const [proof, setProof] = useState('');
  const [bankOpen, setBankOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [shops, ledger, set, acc] = await Promise.all([
        fetchCommerceSellers().catch(() => ({ data: [] as CommerceSellerRow[] })),
        fetchEscrowLedger().catch(() => ({ data: [] as EscrowLedgerRow[] })),
        fetchFinanceSettings().catch(() => ({ data: null })),
        fetchAccountingPack().catch(() => ({ data: null })),
      ]);
      setSellers(shops.data);
      setRows(ledger.data);
      setSettings(set.data);
      setPack(acc.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดการเงินไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (focus === 'settings') setPage('settings');
    else if (focus === 'reports') setPage('reports');
    else if (focus) setPage('overview');
  }, [focus]);

  useEffect(() => {
    if (!payoutRow && !slipRow && !exportOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPayoutRow(null);
      setSlipRow(null);
      setExportOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payoutRow, slipRow, exportOpen]);

  const bank = settings?.bankAccount ?? EMPTY_BANK;

  function patchBank(next: Partial<PlatformBankAccount>) {
    if (!settings) return;
    setSettings({ ...settings, bankAccount: { ...bank, ...next } });
  }

  return (
    <div className="w-full">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-[#8b929a]">การเงิน</p>
          <div className="mt-0.5 flex items-center gap-2">
            <h1 className="font-display text-[32px] font-semibold tracking-[-0.03em] text-[#141516]">
              ภาพรวมการเงิน
            </h1>
            <HelpPopover helpKey="finance" />
          </div>
          <p className="mt-2 max-w-xl text-[13px] text-[#5c636a]">
            <TermTip term="gmv">ยอดขายรวม</TermTip>
            {' · '}
            <TermTip term="gp">GP</TermTip>
            {' · '}
            <TermTip term="escrow">Escrow</TermTip>
            {' · '}
            <TermTip term="vat">VAT</TermTip>
            {' · '}
            <TermTip term="recon">Reconciliation</TermTip>
          </p>
          <nav className="mt-4 flex gap-5">
            {(
              [
                ['overview', 'ภาพรวม'],
                ['reports', 'รายงาน'],
                ['settings', 'ตั้งค่า'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                className={`relative pb-2 text-[13px] font-semibold ${
                  page === id ? 'text-[#141516]' : 'text-[#8b929a] hover:text-[#5c636a]'
                }`}
              >
                {label}
                {page === id ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#141516]" /> : null}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {pack ? (
            <button type="button" className="btn-secondary !rounded-lg !py-2 !text-[13px]" onClick={() => setExportOpen(true)}>
              Export
            </button>
          ) : null}
          <button type="button" className="btn-secondary !rounded-lg !py-2 !text-[13px]" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
          </button>
        </div>
      </header>

      {error ? <div className="mb-5 rounded-xl bg-[#fde8ee] px-4 py-3 text-sm text-[#c81e4a]">{error}</div> : null}
      {msg ? <div className="mb-5 rounded-xl bg-[#e8f6ef] px-4 py-3 text-sm text-[#0c7a52]">{msg}</div> : null}

      {page === 'reports' ? (
        <TaxReportsPanel />
      ) : page === 'overview' ? (
        <div className="space-y-6">
          <BalanceDashboard
            rows={rows}
            loading={loading}
            focus={focus}
            onApprove={(row) => {
              setPayoutRow(row);
              setProof('');
            }}
            onViewSlip={(row) => setSlipRow(row)}
          />
          <WithdrawalsQueuePanel onChanged={() => void refresh()} />
        </div>
      ) : (
      <section className="space-y-4">
        {settings ? (
          <div className="rounded-xl bg-white shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ring-[#141516]/8">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
              onClick={() => setBankOpen((v) => !v)}
            >
              <span className="text-[13px] font-medium text-[#5c636a]">บัญชีรับเงินแพลตฟอร์ม</span>
              <span className="min-w-0 truncate text-[13px] text-[#8b929a]">
                {bank.bankName || bank.bankAccountName || bank.bankAccountNo
                  ? [bank.bankName, bank.bankAccountName, bank.bankAccountNo].filter(Boolean).join(' · ')
                  : 'ยังไม่ตั้งค่า'}
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-[#0c7a52]">{bankOpen ? 'ซ่อน' : 'แก้ไข'}</span>
            </button>
            {bankOpen ? (
              <form
                className="max-w-xl border-t border-[#141516]/8 px-5 py-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canWrite) return;
                  setSaving(true);
                  setMsg(null);
                  void saveFinanceSettings({
                    defaultGpPercent: settings.defaultGpPercent,
                    autoCompleteDays: settings.autoCompleteDays,
                    payoutMode: settings.payoutMode ?? 'MANUAL',
                    autoPayoutMaxLimit: settings.autoPayoutMaxLimit ?? 20000,
                    bankName: bank.bankName || null,
                    bankAccountNo: bank.bankAccountNo || null,
                    bankAccountName: bank.bankAccountName || null,
                    bankCode: bank.bankCode || null,
                  })
                    .then(() => {
                      setMsg('บันทึกบัญชีกลางแล้ว');
                      setBankOpen(false);
                      return refresh();
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'))
                    .finally(() => setSaving(false));
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[13px] sm:col-span-2">
                    <span className="mb-1 block text-[12px] text-[#8b929a]">ธนาคาร</span>
                    <select
                      className="w-full rounded-lg border border-[#141516]/12 bg-transparent px-3 py-2"
                      value={bank.bankCode || ''}
                      disabled={!canWrite}
                      onChange={(e) => {
                        const hit = THAI_BANKS.find((b) => b.code === e.target.value);
                        patchBank({ bankCode: e.target.value, bankName: hit?.name ?? bank.bankName });
                      }}
                    >
                      <option value="">เลือกธนาคาร</option>
                      {THAI_BANKS.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[13px]">
                    <span className="mb-1 block text-[12px] text-[#8b929a]">ชื่อบัญชี</span>
                    <input
                      className="w-full rounded-lg border border-[#141516]/12 px-3 py-2"
                      value={bank.bankAccountName ?? ''}
                      disabled={!canWrite}
                      onChange={(e) => patchBank({ bankAccountName: e.target.value })}
                    />
                  </label>
                  <label className="text-[13px]">
                    <span className="mb-1 block text-[12px] text-[#8b929a]">เลขบัญชี</span>
                    <input
                      className="w-full rounded-lg border border-[#141516]/12 px-3 py-2 font-mono"
                      value={bank.bankAccountNo ?? ''}
                      disabled={!canWrite}
                      onChange={(e) => patchBank({ bankAccountNo: e.target.value.replace(/\D/g, '') })}
                    />
                  </label>
                  <label className="text-[13px]">
                    <span className="mb-1 block text-[12px] text-[#8b929a]">Hold (วัน)</span>
                    <input
                      className="w-full rounded-lg border border-[#141516]/12 px-3 py-2"
                      type="number"
                      min={1}
                      max={30}
                      value={settings.autoCompleteDays}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setSettings({ ...settings, autoCompleteDays: Math.max(1, Number(e.target.value) || 7) })
                      }
                    />
                  </label>
                </div>
                {canWrite ? (
                  <button type="submit" className="btn-primary mt-3 !rounded-lg !py-2 !text-[13px]" disabled={saving}>
                    {saving ? 'กำลังบันทึก…' : 'บันทึกบัญชี'}
                  </button>
                ) : null}
              </form>
            ) : null}
          </div>
        ) : null}

        {settings ? (
          <div className="rounded-xl bg-white p-5 shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ring-[#141516]/8">
            <h3 className="text-[15px] font-semibold text-[#141516]">โหมดจ่ายเงินร้านค้า (Hybrid Payout)</h3>
            <p className="mt-1 text-[12px] text-[#8b929a]">
              AUTO โอนผ่าน Gateway เมื่อยอด ≤ เพดานและไม่มี risk flag · MANUAL ให้แอดมินแนบสลิป
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={(settings.payoutMode ?? 'MANUAL') === 'AUTO'}
                  disabled={!canWrite || saving}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      payoutMode: (settings.payoutMode ?? 'MANUAL') === 'AUTO' ? 'MANUAL' : 'AUTO',
                    })
                  }
                  className={`relative h-7 w-12 rounded-full ${(settings.payoutMode ?? 'MANUAL') === 'AUTO' ? 'bg-[#0c7a52]' : 'bg-[#c5cad0]'}`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      (settings.payoutMode ?? 'MANUAL') === 'AUTO' ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="text-[13px] font-semibold">
                  {(settings.payoutMode ?? 'MANUAL') === 'AUTO' ? 'Auto Payout เปิด' : 'Manual เท่านั้น'}
                </span>
              </label>
              <label className="text-[13px]">
                <span className="mb-1 block text-[11px] text-[#8b929a]">เพดานออโต้ (บาท/ครั้ง)</span>
                <input
                  type="number"
                  min={0}
                  className="w-40 rounded-lg border border-[#141516]/12 px-3 py-2 tabular-nums"
                  value={settings.autoPayoutMaxLimit ?? 20000}
                  disabled={!canWrite}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      autoPayoutMaxLimit: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </label>
              {canWrite ? (
                <button
                  type="button"
                  className="btn-primary !rounded-lg !py-2 !text-[13px]"
                  disabled={saving}
                  onClick={() => {
                    setSaving(true);
                    setMsg(null);
                    void saveFinanceSettings({
                      defaultGpPercent: settings.defaultGpPercent,
                      autoCompleteDays: settings.autoCompleteDays,
                      payoutMode: settings.payoutMode ?? 'MANUAL',
                      autoPayoutMaxLimit: settings.autoPayoutMaxLimit ?? 20000,
                      bankName: bank.bankName || null,
                      bankAccountNo: bank.bankAccountNo || null,
                      bankAccountName: bank.bankAccountName || null,
                      bankCode: bank.bankCode || null,
                    })
                      .then((res) => {
                        setSettings(res.data);
                        setMsg('บันทึกโหมดจ่ายเงินแล้ว');
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ'))
                      .finally(() => setSaving(false));
                  }}
                >
                  {saving ? 'กำลังบันทึก…' : 'บันทึกโหมดจ่าย'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl bg-white p-8 shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ring-[#141516]/8">
          <GpPolicyPanel sellers={sellers} embedded />
        </div>
      </section>
      )}

      {payoutRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141516]/25 p-4" onClick={() => setPayoutRow(null)}>
          <div className="w-full max-w-[420px] rounded-xl bg-white p-6 shadow-[0_8px_28px_rgba(20,21,22,0.08)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[17px] font-semibold">อนุมัติโอนให้ร้าน?</h3>
            <p className="mt-1 text-[13px] text-[#5c636a]">
              {payoutRow.storeName} · {money(payoutRow.netMerchantAmount)}
            </p>
            <ul className="mt-3 space-y-1 text-[13px] text-[#5c636a]">
              <li>• เงินจะถูกบันทึกว่าโอนแล้วในระบบ</li>
              <li>• ต้องมีหลักฐานการโอน</li>
              <li>• การโอนถูกเก็บในบันทึกการทำงาน</li>
            </ul>
            <textarea
              className="mt-4 w-full rounded-lg border border-[#141516]/12 px-3 py-2.5 text-[13px]"
              rows={3}
              placeholder="ลิงก์สลิป หรือเลขอ้างอิงโอน"
              value={proof}
              onChange={(e) => setProof(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setPayoutRow(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn-primary !rounded-lg"
                disabled={!proof.trim()}
                onClick={() => {
                  void markEscrowPayout(payoutRow.id, proof.trim())
                    .then(() => {
                      setMsg('บันทึกการโอนแล้ว');
                      setPayoutRow(null);
                      return refresh();
                    })
                    .catch((e) => setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'));
                }}
              >
                ยืนยันโอน
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exportOpen && pack ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141516]/25 p-4" onClick={() => setExportOpen(false)}>
          <div
            className="max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-xl bg-white p-6 shadow-[0_8px_28px_rgba(20,21,22,0.08)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[12px] font-medium text-[#8b929a]">สรุปก่อนส่งออก</p>
            <h3 className="font-display mt-1 text-[18px] font-semibold">{pack.title}</h3>
            <p className="mt-1 text-[13px] text-[#5c636a]">
              ณ {new Date(pack.generatedAt).toLocaleString('th-TH')} · {pack.currency}
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-[#f7f8fa] px-4 py-3 text-[13px]">
              <dt className="text-[#8b929a]">บัญชีรับเงิน</dt>
              <dd className="text-right font-medium">
                {pack.receivingAccount.bankName || pack.receivingAccount.bankAccountName || 'ยังไม่ตั้งค่า'}
              </dd>
              <dt className="text-[#8b929a]">เลขบัญชี</dt>
              <dd className="text-right font-mono">{pack.receivingAccount.bankAccountNo || '—'}</dd>
              <dt className="text-[#8b929a]">GP มาตรฐาน</dt>
              <dd className="text-right tabular-nums">{pack.escrowRules.defaultGpPercent}%</dd>
              <dt className="text-[#8b929a]">Hold</dt>
              <dd className="text-right tabular-nums">{pack.escrowRules.autoCompleteDays} วัน</dd>
              <dt className="text-[#8b929a]">ออเดอร์ใน escrow</dt>
              <dd className="text-right tabular-nums">{pack.counts.ordersInEscrow}</dd>
              <dt className="text-[#8b929a]">คำขอถอนค้าง</dt>
              <dd className="text-right tabular-nums">{pack.counts.pendingWithdrawals}</dd>
            </dl>

            <table className="mt-5 w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#141516]/8 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8b929a]">
                  <th className="py-2 font-semibold">รายการในไฟล์</th>
                  <th className="py-2 text-right font-semibold">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {pack.lines.map((line) => (
                  <tr key={line.code} className="border-b border-[#141516]/6 last:border-0">
                    <td className="py-2.5">
                      <span className="mr-2 font-mono text-[11px] text-[#8b929a]">{line.code}</span>
                      {line.label}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{money(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 text-[12px] leading-relaxed text-[#8b929a]">{pack.note}</p>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setExportOpen(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn-primary !rounded-lg"
                onClick={() => {
                  downloadAccountingCsv(pack);
                  setExportOpen(false);
                }}
              >
                ดาวน์โหลด CSV
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {slipRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141516]/25 p-4" onClick={() => setSlipRow(null)}>
          <div className="w-full max-w-[420px] rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[17px] font-semibold">สลิป / หลักฐานโอน</h3>
            <p className="mt-3 break-all text-[13px] text-[#5c636a]">{slipRow.payoutProof}</p>
            <button type="button" className="btn-secondary mt-5 !rounded-lg" onClick={() => setSlipRow(null)}>
              ปิด
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
