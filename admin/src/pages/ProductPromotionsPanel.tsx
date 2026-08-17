import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAdminPromotions,
  patchPromotionStatus,
  type AdStatus,
  type PaymentStatus,
  type ProductPromotion,
  type PromoFilter,
} from '../lib/promoApi';

const FILTERS: Array<{ id: PromoFilter; label: string }> = [
  { id: 'pending', label: 'รออนุมัติ' },
  { id: 'active', label: 'กำลังโฆษณา' },
  { id: 'expired', label: 'หมดอายุ' },
  { id: 'all', label: 'ทั้งหมด' },
];

const AD_LABEL: Record<AdStatus, string> = {
  pending_review: 'รออนุมัติ',
  active: 'กำลังโฆษณา',
  expired: 'หมดอายุ',
  rejected: 'ปฏิเสธ',
  stopped: 'ปิดก่อนกำหนด',
};

const PAY_LABEL: Record<PaymentStatus, string> = {
  pending: 'รอตรวจสลิป',
  paid: 'ชำระแล้ว',
  failed: 'ชำระไม่ผ่าน',
};

function adPill(status: AdStatus) {
  if (status === 'active') return 'ok';
  if (status === 'pending_review') return 'warn';
  return 'danger';
}

function payPill(status: PaymentStatus) {
  if (status === 'paid') return 'ok';
  if (status === 'pending') return 'warn';
  return 'danger';
}

function formatThb(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function ProductPromotionsPanel() {
  const [filter, setFilter] = useState<PromoFilter>('pending');
  const [rows, setRows] = useState<ProductPromotion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const res = await fetchAdminPromotions('all');
    setRows(res.data);
  }, []);

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'));
  }, [reload]);

  const visible = useMemo(() => {
    if (filter === 'pending') return rows.filter((r) => r.adStatus === 'pending_review');
    if (filter === 'active') return rows.filter((r) => r.adStatus === 'active');
    if (filter === 'expired') return rows.filter((r) => r.adStatus === 'expired');
    return rows;
  }, [rows, filter]);

  const counts = useMemo(
    () => ({
      pending: rows.filter((r) => r.adStatus === 'pending_review').length,
      active: rows.filter((r) => r.adStatus === 'active').length,
      expired: rows.filter((r) => r.adStatus === 'expired').length,
    }),
    [rows],
  );

  async function act(
    id: string,
    body: Parameters<typeof patchPromotionStatus>[1],
    okMsg: string,
  ) {
    setBusyId(id);
    setError(null);
    setMsg(null);
    try {
      await patchPromotionStatus(id, body);
      setMsg(okMsg);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  function reject(row: ProductPromotion) {
    const reason = window.prompt(
      `เหตุผลที่ปฏิเสธโฆษณาของ「${row.productTitle}」`,
      row.rejectReason ?? '',
    );
    if (reason == null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('ต้องระบุเหตุผลเมื่อปฏิเสธ');
      return;
    }
    void act(row.id, { action: 'reject', rejectReason: trimmed }, 'ปฏิเสธคำขอแล้ว');
  }

  function extend(row: ProductPromotion) {
    const raw = window.prompt('ขยายเวลาเพิ่มกี่วัน?', '7');
    if (raw == null) return;
    const extraDays = Number(raw);
    if (!Number.isFinite(extraDays) || extraDays < 1) {
      setError('จำนวนวันไม่ถูกต้อง');
      return;
    }
    void act(row.id, { action: 'extend', extraDays }, `ขยายเวลา ${extraDays} วันแล้ว`);
  }

  return (
    <div>
      <p className="mb-4 text-sm text-[var(--ink-secondary)]">
        คำขอจากคลังสินค้า · อนุมัติแล้วระบบจะตั้ง <code>is_promoted = true</code> และแจ้งร้านค้าทันที
        — ไม่จำลองชำระเงินสำเร็จ (รอตรวจสลิป/PSP)
      </p>
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-[var(--accent)]">{msg}</p> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? 'btn-primary !py-2 !text-xs' : 'btn-secondary !py-2 !text-xs'}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id === 'pending' && counts.pending ? ` (${counts.pending})` : ''}
            {f.id === 'active' && counts.active ? ` (${counts.active})` : ''}
            {f.id === 'expired' && counts.expired ? ` (${counts.expired})` : ''}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="surface-panel p-8 text-sm text-[var(--ink-secondary)]">
          ยังไม่มีคำขอโฆษณาในตัวกรองนี้
        </div>
      ) : (
        <div className="overflow-x-auto surface-panel">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
                <th className="px-4 py-3 font-bold">สินค้า</th>
                <th className="px-4 py-3 font-bold">ร้านค้า</th>
                <th className="px-4 py-3 font-bold">แพ็กเกจ</th>
                <th className="px-4 py-3 font-bold">ชำระเงิน</th>
                <th className="px-4 py-3 font-bold">สถานะโฆษณา</th>
                <th className="px-4 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-[var(--line)] align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--bg)]">
                        {row.productImageUrl ? (
                          row.productMediaType === 'video' ? (
                            <video
                              src={row.productImageUrl}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={row.productImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--ink-tertiary)]">
                            ไม่มีรูป
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{row.productTitle}</p>
                        <p className="mt-0.5 text-xs text-[var(--ink-tertiary)]">{row.productId}</p>
                        {row.transactionId ? (
                          <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
                            อ้างอิง {row.transactionId}
                          </p>
                        ) : null}
                        {row.paymentProofUrl ? (
                          <a
                            href={row.paymentProofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-block text-xs font-semibold text-[var(--accent)]"
                          >
                            ดูสลิป
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.shopName || '—'}</p>
                    <p className="text-xs text-[var(--ink-tertiary)]">{row.userId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{formatThb(row.priceThb)}</p>
                    <p className="text-xs text-[var(--ink-secondary)]">
                      {row.packageLabel} · {row.durationDays} วัน
                    </p>
                    <p className="mt-1 text-xs text-[var(--ink-tertiary)]">
                      {formatWhen(row.startDate)} → {formatWhen(row.endDate)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`status-pill ${payPill(row.paymentStatus)}`}>
                      {PAY_LABEL[row.paymentStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`status-pill ${adPill(row.adStatus)}`}>
                      {AD_LABEL[row.adStatus]}
                    </span>
                    {row.rejectReason ? (
                      <p className="mt-1 text-xs text-[var(--danger)]">{row.rejectReason}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-stretch gap-1.5">
                      {row.adStatus === 'pending_review' ? (
                        <>
                          <button
                            type="button"
                            className="btn-primary !px-3 !py-1.5 !text-xs"
                            disabled={busyId === row.id}
                            onClick={() =>
                              void act(row.id, { action: 'approve' }, 'อนุมัติแล้ว — โฆษณาเริ่มทำงาน')
                            }
                          >
                            อนุมัติ
                          </button>
                          <button
                            type="button"
                            className="btn-secondary !px-3 !py-1.5 !text-xs"
                            disabled={busyId === row.id}
                            onClick={() => reject(row)}
                          >
                            ปฏิเสธ
                          </button>
                        </>
                      ) : null}
                      {row.adStatus === 'active' || row.adStatus === 'expired' ? (
                        <button
                          type="button"
                          className="btn-secondary !px-3 !py-1.5 !text-xs"
                          disabled={busyId === row.id}
                          onClick={() => extend(row)}
                        >
                          ขยายเวลา
                        </button>
                      ) : null}
                      {row.adStatus === 'active' ? (
                        <button
                          type="button"
                          className="btn-ghost !px-3 !py-1.5 !text-xs text-[var(--danger)]"
                          disabled={busyId === row.id}
                          onClick={() => {
                            if (window.confirm(`ปิดโฆษณา「${row.productTitle}」ก่อนกำหนด?`)) {
                              void act(row.id, { action: 'stop' }, 'ปิดโฆษณาแล้ว');
                            }
                          }}
                        >
                          ปิดก่อนกำหนด
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
