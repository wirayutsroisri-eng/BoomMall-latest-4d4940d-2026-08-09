import { useEffect, useMemo, useState } from 'react';
import type { EscrowLedgerRow } from '../lib/api';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { TermTip } from '../components/TermTip';
import { HelpPopover } from '../components/HelpPopover';

/** แยก VAT 7% จาก GP แบบ inclusive: base = GP/1.07, vat = GP − base */
function splitGpVat(gpInclusive: number) {
  const satang = Math.max(0, Math.round(gpInclusive * 100));
  const taxBaseSatang = Math.round((satang * 100) / 107);
  const vatSatang = satang - taxBaseSatang;
  return {
    taxBase: taxBaseSatang / 100,
    vat: vatSatang / 100,
    netProfit: taxBaseSatang / 100,
  };
}

function money(n: number, digits = 2) {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function moneySigned(n: number) {
  const abs = money(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs.replace('฿', '฿')}`;
  return abs;
}

type PeriodFilter = 'all' | 'day' | 'month';
type StatusFilter = 'all' | 'hold' | 'ready' | 'completed';

function inPeriod(iso: string, period: PeriodFilter, anchor: Date) {
  if (period === 'all') return true;
  const d = new Date(iso);
  if (period === 'day') {
    return (
      d.getFullYear() === anchor.getFullYear() &&
      d.getMonth() === anchor.getMonth() &&
      d.getDate() === anchor.getDate()
    );
  }
  return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
}

function FundStatusBadge({ tab }: { tab: EscrowLedgerRow['tab'] }) {
  const map = {
    hold: { label: 'Holding', className: 'bg-[#fff4e5] text-[#9a6700]' },
    ready: { label: 'Ready', className: 'bg-[#e8f1fb] text-[#1d4e89]' },
    completed: { label: 'Transferred', className: 'bg-[#e8f6ef] text-[#0c7a52]' },
    other: { label: 'Other', className: 'bg-[#f0f2f5] text-[#5c636a]' },
  } as const;
  const tone = map[tab];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.className}`}>
      {tone.label}
    </span>
  );
}

type Props = {
  rows: EscrowLedgerRow[];
  loading: boolean;
  focus?: string | null;
  onApprove: (row: EscrowLedgerRow) => void;
  onViewSlip: (row: EscrowLedgerRow) => void;
};

export function BalanceDashboard({ rows, loading, focus, onApprove, onViewSlip }: Props) {
  const { session } = useAdminAuth();
  const canWrite = Boolean(session?.permissions.gpWrite);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [drill, setDrill] = useState<'gp' | 'gmv' | 'vat' | 'net' | null>(null);
  const anchor = useMemo(() => new Date(), []);

  useEffect(() => {
    if (focus === 'escrow') setStatus('hold');
    else if (focus === 'payout') setStatus('ready');
    else if (focus === 'gp') {
      setStatus('all');
      setDrill('gp');
    } else if (focus === 'refund' || focus === 'recon' || focus === 'balance') {
      setStatus('all');
    }
  }, [focus]);

  const activeRows = useMemo(
    () =>
      rows.filter((r) => {
        if (focus === 'refund') return r.releaseStatus === 'REFUNDED' || r.releaseStatus === 'CANCELLED';
        return r.tab !== 'other' && r.releaseStatus !== 'REFUNDED' && r.releaseStatus !== 'CANCELLED';
      }),
    [rows, focus],
  );

  const periodRows = useMemo(
    () => activeRows.filter((r) => inPeriod(r.createdAt, period, anchor)),
    [activeRows, period, anchor],
  );

  const buckets = useMemo(() => {
    const hold = periodRows.filter((r) => r.tab === 'hold');
    const ready = periodRows.filter((r) => r.tab === 'ready');
    const settled = periodRows.filter((r) => r.tab === 'completed');
    const sumNet = (list: EscrowLedgerRow[]) => list.reduce((s, r) => s + r.netMerchantAmount, 0);
    const inflow = periodRows.reduce((s, r) => s + r.grossAmount, 0);
    const gpInclusive = periodRows.reduce((s, r) => s + r.gpAmount, 0);
    const vatSplit = splitGpVat(gpInclusive);
    const sellerHold = sumNet(hold);
    const sellerReady = sumNet(ready);
    const sellerSettled = sumNet(settled);
    const sellerBalance = sellerHold + sellerReady + sellerSettled;
    const rhs = sellerBalance + gpInclusive;
    const delta = Math.round((inflow - rhs) * 100) / 100;
    const balanced = Math.abs(delta) < 0.02;

    return {
      inflow,
      gpInclusive,
      vat: vatSplit.vat,
      netGpProfit: vatSplit.netProfit,
      sellerHold,
      sellerReady,
      sellerSettled,
      sellerBalance,
      rhs,
      delta,
      balanced,
      counts: { hold: hold.length, ready: ready.length, settled: settled.length },
    };
  }, [periodRows]);

  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return periodRows.filter((r) => {
      if (status !== 'all' && r.tab !== status) return false;
      if (!q) return true;
      return `${r.orderId} ${r.storeName} ${r.storeId}`.toLowerCase().includes(q);
    });
  }, [periodRows, status, query]);

  const footer = useMemo(() => {
    let inflow = 0;
    let gpBase = 0;
    let vat = 0;
    let seller = 0;
    for (const r of tableRows) {
      const split = splitGpVat(r.gpAmount);
      inflow += r.grossAmount;
      gpBase += split.taxBase;
      vat += split.vat;
      seller += r.netMerchantAmount;
    }
    return { inflow, gpBase, vat, seller };
  }, [tableRows]);

  const metrics = [
    { id: 'gmv' as const, label: 'ยอดขายรวมทั้งระบบ', sub: 'GMV / Gross Sales', value: buckets.inflow, term: 'gmv' as const },
    { id: 'gp' as const, label: 'รายได้ค่า GP รวม', sub: 'Total GP Earned', value: buckets.gpInclusive, term: 'gp' as const },
    { id: 'vat' as const, label: 'ภาษีขาย 7%', sub: 'Output VAT', value: buckets.vat, term: 'vat' as const },
    { id: 'net' as const, label: 'กำไรค่า GP สุทธิ', sub: 'Net GP Profit', value: buckets.netGpProfit, term: 'netGp' as const },
  ];

  const funds = [
    {
      title: 'ถังที่ 1 · พักเงิน',
      desc: 'Escrow Hold — ยังไม่ถึงเวลาย้ายให้ร้าน',
      value: buckets.sellerHold,
      count: buckets.counts.hold,
      tone: 'text-[#9a6700]',
      bar: 'bg-[#f5a623]',
    },
    {
      title: 'ถังที่ 2 · พร้อมจ่าย',
      desc: 'Available — ร้านเบิกหรือรับโอนได้แล้ว',
      value: buckets.sellerReady,
      count: buckets.counts.ready,
      tone: 'text-[#1d4e89]',
      bar: 'bg-[#3b82f6]',
    },
    {
      title: 'ถังที่ 3 · โอนแล้ว',
      desc: 'Settled — โอนให้ร้านค้าแล้ว',
      value: buckets.sellerSettled,
      count: buckets.counts.settled,
      tone: 'text-[#0c7a52]',
      bar: 'bg-[#0c7a52]',
    },
  ];

  const fundTotal = buckets.sellerBalance || 1;

  return (
    <div className="space-y-6">
      {/* Balance Health Checker */}
      <section
        className={`rounded-xl px-5 py-4 ring-1 ${
          buckets.balanced
            ? 'bg-[#e8f6ef]/60 ring-[#0c7a52]/20'
            : 'bg-[#fff4e5]/70 ring-[#9a6700]/25'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#8b929a]">
              ตรวจยอด <TermTip term="recon">Reconciliation</TermTip>
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px] text-[#141516]">
              <span className="font-semibold tabular-nums">{money(buckets.inflow)}</span>
              <span className="text-[#8b929a]">Inflow</span>
              <span className="text-[#8b929a]">=</span>
              <span className="font-semibold tabular-nums">{money(buckets.sellerBalance)}</span>
              <span className="text-[#8b929a]">Seller Balance</span>
              <span className="text-[#8b929a]">+</span>
              <span className="font-semibold tabular-nums">{money(buckets.gpInclusive)}</span>
              <span className="text-[#8b929a]">GP (+VAT)</span>
            </p>
            {!buckets.balanced ? (
              <p className="mt-1 text-[12px] text-[#9a6700]">
                ส่วนต่าง {moneySigned(buckets.delta)} — ตรวจออเดอร์ที่คืนเงินหรือยังไม่เข้า ledger
              </p>
            ) : null}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
              buckets.balanced ? 'bg-[#0c7a52] text-white' : 'bg-[#9a6700] text-white'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
            {buckets.balanced ? 'ยอดตรงกัน' : 'ต้องตรวจ'}
          </span>
        </div>
      </section>

      {/* Metric cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => {
              setDrill(m.id);
              document.getElementById('finance-ledger')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className={`rounded-xl bg-white px-5 py-4 text-left shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ${
              drill === m.id ? 'ring-[#0c7a52]' : 'ring-[#141516]/8'
            }`}
          >
            <p className="text-[12px] font-medium text-[#8b929a]">
              <TermTip term={m.term}>{m.label}</TermTip>
            </p>
            <p className="mt-0.5 text-[11px] text-[#8b929a]">{m.sub}</p>
            <p className="font-display mt-2 text-[28px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[#141516]">
              {loading ? '—' : money(m.value)}
            </p>
            <p className="mt-2 text-[11px] font-semibold text-[#0c7a52]">ดูออเดอร์ที่ประกอบตัวเลขนี้</p>
          </button>
        ))}
      </section>

      {/* Seller fund buckets */}
      <section className="rounded-xl bg-white p-5 shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ring-[#141516]/8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#141516]">
              ยอดร้านค้า <HelpPopover helpKey="sellerBalance" />
            </h2>
            <p className="mt-0.5 text-[12px] text-[#8b929a]">แจกแจงเงินร้านเป็น 3 ถังตามสถานะการจ่าย</p>
          </div>
          <p className="text-[13px] font-semibold tabular-nums text-[#141516]">
            รวม {money(buckets.sellerBalance)}
          </p>
        </div>
        <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-[#f0f2f5]">
          {funds.map((f) => (
            <div
              key={f.title}
              className={`${f.bar} transition-all`}
              style={{ width: `${Math.max(0, (f.value / fundTotal) * 100)}%` }}
              title={`${f.title}: ${money(f.value)}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {funds.map((f) => (
            <div key={f.title} className="rounded-lg bg-[#f7f8fa] px-4 py-3">
              <p className="text-[12px] font-medium text-[#8b929a]">{f.title}</p>
              <p className="mt-0.5 text-[11px] text-[#8b929a]">{f.desc}</p>
              <p className={`font-display mt-2 text-[22px] font-semibold tracking-[-0.03em] tabular-nums ${f.tone}`}>
                {money(f.value)}
              </p>
              <p className="mt-1 text-[11px] text-[#8b929a]">{f.count} ออเดอร์</p>
            </div>
          ))}
        </div>
      </section>

      {/* Reconciliation table */}
      <section id="finance-ledger" className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ring-[#141516]/8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#141516]/8 px-5 py-3">
          <div>
            <h2 className="text-[15px] font-semibold">
              <TermTip term="recon">กระทบยอด</TermTip>
            </h2>
            <p className="text-[12px] text-[#8b929a]">
              {drill === 'gp'
                ? 'GP มาจากออเดอร์ด้านล่าง — ไม่ใช่ตัวเลขจำลอง'
                : focus === 'refund'
                  ? 'รายการคืนเงิน / ยกเลิกในช่วงที่เลือก'
                  : 'บันทึกเงินเข้า–ออกต่อออเดอร์'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-[#f0f2f5] p-0.5 text-[12px]">
              {(
                [
                  ['all', 'ทั้งหมด'],
                  ['day', 'รายวัน'],
                  ['month', 'รายเดือน'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPeriod(id)}
                  className={`rounded-md px-2.5 py-1.5 font-semibold ${
                    period === id ? 'bg-white text-[#141516]' : 'text-[#8b929a]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              className="rounded-lg border-0 bg-[#f0f2f5] px-3 py-1.5 text-[12px] font-semibold text-[#141516] outline-none"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="hold">Holding</option>
              <option value="ready">Ready</option>
              <option value="completed">Transferred</option>
            </select>
            <input
              className="w-44 rounded-lg border-0 bg-[#f0f2f5] px-3 py-1.5 text-[13px] outline-none placeholder:text-[#8b929a]"
              placeholder="ค้นหาออเดอร์ / ร้าน"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#141516]/8 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8b929a]">
                <th className="px-5 py-2.5 font-semibold">Order ID</th>
                <th className="px-5 py-2.5 font-semibold">ร้านค้า</th>
                <th className="px-5 py-2.5 text-right font-semibold">ยอดเงินเข้า (+)</th>
                <th className="px-5 py-2.5 text-right font-semibold">หัก GP (ก่อน VAT)</th>
                <th className="px-5 py-2.5 text-right font-semibold">หัก VAT 7%</th>
                <th className="px-5 py-2.5 text-right font-semibold">ยอดจ่ายร้าน</th>
                <th className="px-5 py-2.5 font-semibold">สถานะเงิน</th>
                <th className="px-5 py-2.5 text-right font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length ? (
                tableRows.map((row) => {
                  const split = splitGpVat(row.gpAmount);
                  return (
                    <tr key={row.id} className="border-b border-[#141516]/6 hover:bg-[#f7f8fa]">
                      <td className="px-5 py-3 font-mono text-[12px] text-[#5c636a]">{row.orderId.slice(0, 12)}</td>
                      <td className="px-5 py-3 text-[13px] font-medium">{row.storeName}</td>
                      <td className="px-5 py-3 text-right text-[13px] font-semibold tabular-nums text-[#0c7a52]">
                        {moneySigned(row.grossAmount)}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums text-[#5c636a]">
                        −{money(split.taxBase)}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] tabular-nums text-[#8b929a]">
                        −{money(split.vat)}
                      </td>
                      <td className="px-5 py-3 text-right text-[13px] font-semibold tabular-nums">
                        {money(row.netMerchantAmount)}
                      </td>
                      <td className="px-5 py-3">
                        <FundStatusBadge tab={row.tab} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {row.tab === 'ready' && canWrite ? (
                          <button
                            type="button"
                            className="text-[13px] font-semibold text-[#0c7a52] hover:underline"
                            onClick={() => onApprove(row)}
                          >
                            อนุมัติโอน
                          </button>
                        ) : null}
                        {row.tab === 'completed' && row.payoutProof ? (
                          <button
                            type="button"
                            className="text-[13px] font-semibold text-[#5c636a] hover:underline"
                            onClick={() => onViewSlip(row)}
                          >
                            ดูสลิป
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-[13px] text-[#8b929a]">
                    {loading
                      ? 'กำลังโหลด…'
                      : focus === 'refund'
                        ? 'ยังไม่มีรายการคืนเงินในช่วงนี้ เมื่อมีการคืนเงิน ระบบจะแสดงที่นี่โดยอัตโนมัติ'
                        : 'ยังไม่มีธุรกรรมในช่วงเวลานี้ เมื่อมีคำสั่งซื้อ ระบบจะแสดงข้อมูลการรับเงิน GP VAT และยอดร้านค้าที่นี่โดยอัตโนมัติ'}
                  </td>
                </tr>
              )}
            </tbody>
            {tableRows.length ? (
              <tfoot>
                <tr className="border-t-2 border-[#141516]/12 bg-[#f7f8fa] text-[13px] font-semibold">
                  <td className="px-5 py-3.5" colSpan={2}>
                    รวม {tableRows.length} รายการ
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-[#0c7a52]">{moneySigned(footer.inflow)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">−{money(footer.gpBase)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-[#8b929a]">−{money(footer.vat)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{money(footer.seller)}</td>
                  <td className="px-5 py-3.5" colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </div>
  );
}
