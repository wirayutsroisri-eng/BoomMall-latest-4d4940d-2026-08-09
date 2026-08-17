import { useCallback, useEffect, useState } from 'react';
import {
  approveSellerWithdrawal,
  fetchFinanceSettings,
  fetchSellerWithdrawals,
  rejectSellerWithdrawal,
  saveFinanceSettings,
  type PlatformFinanceSettings,
  type SellerWithdrawalRow,
} from '../lib/api';
import { useAdminAuth } from '../auth/AdminAuthContext';

function money(n: number) {
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

function maskAccount(no: string | null) {
  const d = (no ?? '').replace(/\D/g, '');
  if (d.length < 4) return d || '—';
  return `•••• ${d.slice(-4)}`;
}

function ChannelBadge({ row }: { row: SellerWithdrawalRow }) {
  if (row.badge === 'auto_done' || (row.status === 'TRANSFERRED' && row.payoutChannel === 'AUTO')) {
    return (
      <span className="inline-flex rounded-full bg-[#e8f6ef] px-2.5 py-0.5 text-[11px] font-semibold text-[#0c7a52]">
        ระบบโอนออโต้สำเร็จ (Auto)
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-[#fff4e5] px-2.5 py-0.5 text-[11px] font-semibold text-[#9a6700]">
      รอแอดมินโอน (Manual)
    </span>
  );
}

type Props = {
  onChanged?: () => void;
};

export function WithdrawalsQueuePanel({ onChanged }: Props) {
  const { session } = useAdminAuth();
  const canWrite = Boolean(session?.permissions.gpWrite);
  const [rows, setRows] = useState<SellerWithdrawalRow[]>([]);
  const [settings, setSettings] = useState<PlatformFinanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [approveRow, setApproveRow] = useState<SellerWithdrawalRow | null>(null);
  const [proof, setProof] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wd, st] = await Promise.all([
        fetchSellerWithdrawals(),
        fetchFinanceSettings().catch(() => ({ data: null as PlatformFinanceSettings | null })),
      ]);
      setRows(wd.data);
      if (st.data) setSettings(st.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดคำขอถอนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pendingCount = rows.filter((r) => r.status === 'PENDING' || r.status === 'APPROVED').length;
  const autoOn = settings?.payoutMode === 'AUTO';
  const maxLimit = settings?.autoPayoutMaxLimit ?? 20000;

  const persistPayoutSettings = async (next: {
    payoutMode: 'MANUAL' | 'AUTO';
    autoPayoutMaxLimit: number;
  }) => {
    if (!canWrite || !settings) return;
    setSavingMode(true);
    setError(null);
    try {
      const res = await saveFinanceSettings({
        defaultGpPercent: settings.defaultGpPercent,
        autoCompleteDays: settings.autoCompleteDays,
        payoutMode: next.payoutMode,
        autoPayoutMaxLimit: next.autoPayoutMaxLimit,
        bankName: settings.bankAccount.bankName,
        bankAccountNo: settings.bankAccount.bankAccountNo,
        bankAccountName: settings.bankAccount.bankAccountName,
        bankCode: settings.bankAccount.bankCode,
      });
      setSettings(res.data);
      setMsg(
        next.payoutMode === 'AUTO'
          ? `เปิด Auto Payout แล้ว (เพดาน ${money(next.autoPayoutMaxLimit)}/ครั้ง)`
          : 'ปิด Auto Payout — ทุกคำขอเข้าคิว Manual',
      );
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกโหมดถอนไม่สำเร็จ');
    } finally {
      setSavingMode(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ring-[#141516]/8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#141516]/8 px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#141516]">คำขอถอนเงินจากร้านค้า</h2>
          <p className="text-[12px] text-[#8b929a]">
            Hybrid: Auto ผ่าน Gateway เมื่อเข้าเงื่อนไข · Manual รอแนบสลิป
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#fff4e5] px-2.5 py-0.5 text-[12px] font-semibold text-[#9a6700]">
            {pendingCount} รออนุมัติ
          </span>
          <button type="button" className="btn-secondary !rounded-lg !py-1.5 !text-[12px]" onClick={() => void refresh()}>
            {loading ? '…' : 'รีเฟรช'}
          </button>
        </div>
      </div>

      {settings ? (
        <div className="flex flex-wrap items-end gap-4 border-b border-[#141516]/8 bg-[#f7f8fa] px-5 py-3.5">
          <label className="flex cursor-pointer items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={autoOn}
              disabled={!canWrite || savingMode}
              onClick={() =>
                void persistPayoutSettings({
                  payoutMode: autoOn ? 'MANUAL' : 'AUTO',
                  autoPayoutMaxLimit: maxLimit,
                })
              }
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                autoOn ? 'bg-[#0c7a52]' : 'bg-[#c5cad0]'
              } ${!canWrite ? 'opacity-50' : ''}`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  autoOn ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span>
              <span className="block text-[13px] font-semibold text-[#141516]">Auto Payout</span>
              <span className="block text-[11px] text-[#8b929a]">
                {autoOn ? 'โอนออโต้เมื่อ ≤ เพดาน และไม่มี risk flag' : 'ปิด — ส่งทุกคำขอให้แอดมิน'}
              </span>
            </span>
          </label>
          <label className="text-[13px]">
            <span className="mb-1 block text-[11px] text-[#8b929a]">เพดานออโต้ต่อครั้ง (บาท)</span>
            <input
              type="number"
              min={0}
              step={1000}
              className="w-36 rounded-lg border border-[#141516]/12 bg-white px-3 py-1.5 tabular-nums"
              value={maxLimit}
              disabled={!canWrite || savingMode}
              onChange={(e) => {
                if (!settings) return;
                setSettings({
                  ...settings,
                  autoPayoutMaxLimit: Math.max(0, Number(e.target.value) || 0),
                });
              }}
              onBlur={() => {
                if (!settings) return;
                void persistPayoutSettings({
                  payoutMode: settings.payoutMode,
                  autoPayoutMaxLimit: Math.max(0, settings.autoPayoutMaxLimit || 0),
                });
              }}
            />
          </label>
        </div>
      ) : null}

      {error ? <div className="mx-5 mt-3 rounded-lg bg-[#fde8ee] px-3 py-2 text-[13px] text-[#c81e4a]">{error}</div> : null}
      {msg ? <div className="mx-5 mt-3 rounded-lg bg-[#e8f6ef] px-3 py-2 text-[13px] text-[#0c7a52]">{msg}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#141516]/8 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8b929a]">
              <th className="px-5 py-2.5 font-semibold">ร้านค้า</th>
              <th className="px-5 py-2.5 font-semibold">บัญชีรับเงิน</th>
              <th className="px-5 py-2.5 text-right font-semibold">ยอดถอน</th>
              <th className="px-5 py-2.5 font-semibold">ประเภท</th>
              <th className="px-5 py-2.5 font-semibold">วันที่ยื่น</th>
              <th className="px-5 py-2.5 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => {
                const isPending = row.status === 'PENDING' || row.status === 'APPROVED';
                return (
                  <tr key={row.id} className="border-b border-[#141516]/6 last:border-0 hover:bg-[#f7f8fa]">
                    <td className="px-5 py-3.5">
                      <p className="text-[13px] font-semibold text-[#141516]">{row.storeName || row.sellerId}</p>
                      <p className="font-mono text-[11px] text-[#8b929a]">{row.sellerId.slice(0, 12)}</p>
                    </td>
                    <td className="px-5 py-3.5 text-[13px]">
                      <p className="font-medium">{row.bankName || '—'}</p>
                      <p className="text-[12px] text-[#5c636a]">
                        {maskAccount(row.bankAccountNo)} · {row.bankAccountName || '—'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px] font-semibold tabular-nums">{money(row.amount)}</td>
                    <td className="px-5 py-3.5">
                      <ChannelBadge row={row} />
                      {row.manualReason && isPending ? (
                        <p className="mt-1 text-[10px] text-[#8b929a]">{row.manualReason}</p>
                      ) : null}
                      {row.payoutRef ? (
                        <p className="mt-1 font-mono text-[10px] text-[#8b929a]">{row.payoutRef}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#5c636a]">
                      {new Date(row.createdAt).toLocaleString('th-TH')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {isPending ? (
                        canWrite ? (
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              className="text-[13px] font-semibold text-[#0c7a52] hover:underline"
                              disabled={busyId === row.id}
                              onClick={() => {
                                setApproveRow(row);
                                setProof('');
                                setMsg(null);
                              }}
                            >
                              อนุมัติโอน
                            </button>
                            <button
                              type="button"
                              className="text-[13px] font-semibold text-[#c81e4a] hover:underline"
                              disabled={busyId === row.id}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `ปฏิเสธคำขอถอน ${money(row.amount)} ของ ${row.storeName || row.sellerId}? ยอดจะคืนเข้า Available`,
                                  )
                                ) {
                                  return;
                                }
                                setBusyId(row.id);
                                setError(null);
                                void rejectSellerWithdrawal(row.id)
                                  .then(() => {
                                    setMsg('ปฏิเสธแล้ว — คืนยอดให้ร้าน');
                                    return refresh();
                                  })
                                  .then(() => onChanged?.())
                                  .catch((e) => setError(e instanceof Error ? e.message : 'ปฏิเสธไม่สำเร็จ'))
                                  .finally(() => setBusyId(null));
                              }}
                            >
                              ปฏิเสธ
                            </button>
                          </div>
                        ) : (
                          <span className="text-[12px] text-[#8b929a]">ดูอย่างเดียว</span>
                        )
                      ) : (
                        <span className="text-[12px] font-semibold text-[#0c7a52]">โอนแล้ว</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-5 py-14 text-center text-[13px] text-[#8b929a]">
                  {loading ? 'กำลังโหลด…' : 'ยังไม่มีคำขอถอน'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {approveRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141516]/25 p-4"
          onClick={() => setApproveRow(null)}
        >
          <div
            className="w-full max-w-[420px] rounded-xl bg-white p-6 shadow-[0_8px_28px_rgba(20,21,22,0.08)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[17px] font-semibold">อนุมัติโอนคำขอถอน</h3>
            <p className="mt-1 text-[13px] text-[#5c636a]">
              {approveRow.storeName || approveRow.sellerId} · {money(approveRow.amount)}
            </p>
            <p className="mt-2 text-[12px] text-[#8b929a]">
              {approveRow.bankName} · {maskAccount(approveRow.bankAccountNo)} · {approveRow.bankAccountName}
            </p>
            <textarea
              className="mt-4 w-full rounded-lg border border-[#141516]/12 px-3 py-2.5 text-[13px]"
              rows={3}
              placeholder="ลิงก์สลิป หรือเลขอ้างอิงโอน (จำเป็น)"
              value={proof}
              onChange={(e) => setProof(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setApproveRow(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn-primary !rounded-lg"
                disabled={!proof.trim() || busyId === approveRow.id}
                onClick={() => {
                  setBusyId(approveRow.id);
                  setError(null);
                  void approveSellerWithdrawal(approveRow.id, proof.trim())
                    .then(() => {
                      setMsg('บันทึกโอนสำเร็จแล้ว');
                      setApproveRow(null);
                      return refresh();
                    })
                    .then(() => onChanged?.())
                    .catch((e) => setError(e instanceof Error ? e.message : 'อนุมัติไม่สำเร็จ'))
                    .finally(() => setBusyId(null));
                }}
              >
                ยืนยันโอน
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
