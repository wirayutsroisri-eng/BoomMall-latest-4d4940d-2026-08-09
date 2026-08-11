import { useMemo, useState } from 'react';
import {
  approveTopUp,
  newIdempotencyKey,
  type TopUpRow,
} from '../lib/api';

function fmt(n: string) {
  try {
    return BigInt(n).toLocaleString('en-US');
  } catch {
    return n;
  }
}

type Props = {
  rows: TopUpRow[];
  loading: boolean;
  onChanged: () => void;
};

export function TopUpReviewPanel({ rows, loading, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TopUpRow | null>(null);
  /** Stable key per top-up so double-click / retry uses same Idempotency-Key */
  const keys = useMemo(() => new Map<string, string>(), []);

  const pending = rows.filter((r) => r.status === 'PENDING');
  const others = rows.filter((r) => r.status !== 'PENDING');

  async function onApprove(row: TopUpRow) {
    setError(null);
    setBusyId(row.id);
    try {
      if (!keys.has(row.id)) keys.set(row.id, newIdempotencyKey(`topup-${row.id}`));
      const key = keys.get(row.id)!;
      await approveTopUp(row.id, key, 'ตรวจสลิปแล้ว อนุมัติจาก Admin Dashboard');
      onChanged();
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-extrabold text-[#0b1f17]">
          Seller Top-up Review
        </h2>
        <p className="mt-1 text-sm text-[#122820]/70">
          ตรวจ Proof of Payment → Approve จะ Mint Coin (1 THB = 1 Coin) เข้า Seller Wallet
          ผ่าน double-entry ledger เท่านั้น
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[#122820]/10 bg-white/80 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#122820] text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">ร้านค้า</th>
              <th className="px-4 py-3 font-semibold">ยอด THB / Coin</th>
              <th className="px-4 py-3 font-semibold">สถานะ</th>
              <th className="px-4 py-3 font-semibold">สลิป</th>
              <th className="px-4 py-3 font-semibold">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#122820]/60">
                  กำลังโหลด…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#122820]/60">
                  ไม่มีรายการ
                </td>
              </tr>
            ) : null}
            {[...pending, ...others].map((row) => (
              <tr key={row.id} className="border-t border-[#122820]/8">
                <td className="px-4 py-3">
                  <div className="font-semibold">{row.sellerWallet.displayName}</div>
                  <div className="text-xs text-[#122820]/55">{row.sellerWallet.ownerRef}</div>
                </td>
                <td className="px-4 py-3 font-semibold tabular-nums">
                  ฿{fmt(row.amountThb)}
                  <span className="mx-1 text-[#122820]/35">→</span>
                  {fmt(row.amountCoin)} 🪙
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="font-semibold text-[#0b7a52] underline-offset-2 hover:underline"
                    onClick={() => setPreview(row)}
                  >
                    ดูสลิป
                  </button>
                </td>
                <td className="px-4 py-3">
                  {row.status === 'PENDING' ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onApprove(row)}
                      className="rounded-lg bg-[#00d68f] px-3 py-1.5 text-sm font-bold text-[#0b1f17] hover:brightness-105 disabled:opacity-50"
                    >
                      {busyId === row.id ? 'กำลังอนุมัติ…' : 'Approve / อนุมัติ'}
                    </button>
                  ) : (
                    <span className="text-xs text-[#122820]/50">
                      {row.reviewedBy ? `โดย ${row.reviewedBy}` : '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1f17]/55 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-extrabold">Proof of Payment</h3>
                <p className="text-sm text-[#122820]/70">
                  {preview.sellerWallet.displayName} · ฿{fmt(preview.amountThb)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-lg"
                onClick={() => setPreview(null)}
              >
                ✕
              </button>
            </div>
            {preview.proofNote ? (
              <p className="mt-3 rounded-xl bg-[#e8f2ec] px-3 py-2 text-sm">{preview.proofNote}</p>
            ) : null}
            <img
              src={preview.proofUrl}
              alt="Payment slip"
              className="mt-4 max-h-[50vh] w-full rounded-xl object-contain bg-[#f4faf6]"
            />
            {preview.status === 'PENDING' ? (
              <button
                type="button"
                disabled={busyId === preview.id}
                onClick={() => void onApprove(preview)}
                className="mt-4 w-full rounded-xl bg-[#00d68f] py-3 text-sm font-bold text-[#0b1f17]"
              >
                {busyId === preview.id ? 'กำลัง Mint…' : 'ยืนยันอนุมัติ & Mint Coin'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatusPill({ status }: { status: TopUpRow['status'] }) {
  const styles: Record<TopUpRow['status'], string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-rose-100 text-rose-800',
    CANCELLED: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}
