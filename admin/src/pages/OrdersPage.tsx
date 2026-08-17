import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { TermTip } from '../components/TermTip';
import { fetchCommerceOrders, type CommerceOrderRow } from '../lib/api';

const STEPS = [
  { key: 'created', label: 'สร้างออเดอร์' },
  { key: 'paid', label: 'ชำระเงิน' },
  { key: 'escrow', label: 'พักเงิน' },
  { key: 'processing', label: 'ร้านกำลังจัด' },
  { key: 'shipping', label: 'จัดส่ง' },
  { key: 'delivered', label: 'ถึงผู้ซื้อ' },
  { key: 'settled', label: 'โอนให้ร้าน' },
] as const;

function money(n: number | null | undefined) {
  if (n == null) return '—';
  return `฿${n.toLocaleString('th-TH')}`;
}

function stepIndex(row: CommerceOrderRow) {
  const ship = (row.shippingStatus ?? '').toUpperCase();
  const settle = (row.settlementStatus ?? '').toUpperCase();
  const status = row.status.toUpperCase();
  if (settle.includes('SETTLE') || settle.includes('RELEASE') || settle.includes('PAID')) return 6;
  if (ship.includes('DELIVER')) return 5;
  if (ship.includes('SHIP') || ship.includes('TRANSIT')) return 4;
  if (status.includes('PACK') || status.includes('PROCESS')) return 3;
  if (status.includes('PAID') || status.includes('ESCROW')) return 2;
  if (status.includes('PAY')) return 1;
  return 0;
}

function problem(row: CommerceOrderRow) {
  const ret = (row.returnStatus ?? '').toUpperCase();
  if (ret && ret !== 'NONE') return 'มีคืนสินค้า / ข้อพิพาท';
  return null;
}

export function OrdersPage() {
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const view = params.get('view');
  const [rows, setRows] = useState<CommerceOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(focus);

  const refresh = useCallback(async () => {
    try {
      setRows((await fetchCommerceOrders()).data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดคำสั่งซื้อไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (focus) setOpenId(focus);
  }, [focus]);

  const shown = useMemo(() => {
    const list = view === 'disputes' ? rows.filter((r) => problem(r)) : rows;
    return list.slice(0, 80);
  }, [rows, view]);

  return (
    <div>
      <PageHeader
        eyebrow="การซื้อขาย"
        title={view === 'disputes' ? 'ข้อพิพาท / คืนเงิน' : 'คำสั่งซื้อ'}
        description={
          view === 'disputes'
            ? 'ออเดอร์ที่มีคืนสินค้าหรือข้อพิพาท — ดูว่าเงินอยู่ขั้นไหนและสินค้าถึงไหนแล้ว'
            : 'ดูว่าเงินอยู่ที่ไหน และสินค้าถึงขั้นตอนไหน — ไม่แสดงตัวเลขจำลอง'
        }
        helpKey="orders"
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {shown.length === 0 ? (
        <EmptyState
          title={view === 'disputes' ? 'ยังไม่มีข้อพิพาทในช่วงนี้' : 'ยังไม่มีคำสั่งซื้อในช่วงนี้'}
          description={
            view === 'disputes'
              ? 'เมื่อมีการคืนสินค้าหรือข้อพิพาท รายการจะขึ้นที่นี่ พร้อมไทม์ไลน์เงินและสินค้า'
              : 'เมื่อมีคนชำระเงิน ระบบจะแสดงสถานะพักเงิน การจัดส่ง และการโอนให้ร้านที่นี่โดยอัตโนมัติ'
          }
        />
      ) : (
        <div className="space-y-3">
          {shown.map((row) => {
            const idx = stepIndex(row);
            const issue = problem(row);
            const open = openId === row.id;
            return (
              <article key={row.id} className="surface-panel p-5">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
                  onClick={() => setOpenId(open ? null : row.id)}
                >
                  <div>
                    <p className="text-xs font-bold text-[var(--ink-tertiary)]">{row.id}</p>
                    <h3 className="font-display mt-1 text-lg font-extrabold">{money(row.merchandiseThb)}</h3>
                    <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                      ผู้ซื้อ {row.buyerId} · ร้าน {row.merchantId ?? '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{row.status}</p>
                    {issue ? <p className="text-xs font-bold text-[var(--danger)]">{issue}</p> : null}
                    <p className="text-xs text-[var(--ink-tertiary)]">
                      <TermTip term="gp">GP</TermTip> {money(row.gpAmountThb)}
                    </p>
                  </div>
                </button>
                {open ? (
                  <ol className="mt-4 grid gap-2 sm:grid-cols-7">
                    {STEPS.map((s, i) => (
                      <li
                        key={s.key}
                        className={`rounded-[12px] px-2 py-2 text-center text-[11px] font-bold ${
                          issue && i === idx
                            ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                            : i <= idx
                              ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                              : 'bg-[var(--bg)] text-[var(--ink-tertiary)]'
                        }`}
                      >
                        {s.label}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
