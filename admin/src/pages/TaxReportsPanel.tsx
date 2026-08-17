import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadTaxReport,
  fetchTaxReportSummary,
  type TaxReportKind,
  type TaxReportSummary,
} from '../lib/api';

function money(n: number) {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const DOWNLOADS: Array<{
  kind: TaxReportKind;
  format: 'xlsx' | 'pdf' | 'csv';
  title: string;
  hint: string;
}> = [
  { kind: 'sales-tax', format: 'xlsx', title: 'รายงานภาษีขาย (ภ.พ.30) — Excel', hint: 'GP ก่อน VAT + VAT 7% และชีตลดหนี้' },
  { kind: 'sales-tax', format: 'pdf', title: 'รายงานภาษีขาย (ภ.พ.30) — PDF', hint: 'สำเนาพิมพ์ สรุปภาษีขาย / ลดหนี้' },
  { kind: 'revenue-ledger', format: 'xlsx', title: 'รายงานสรุปรายได้แพลตฟอร์ม — Excel', hint: 'GMV, GP, สถานะ, ค่าธรรมเนียม PSP' },
  { kind: 'payouts', format: 'xlsx', title: 'รายงานการจ่ายเงินร้านค้า — Excel', hint: 'เฉพาะรายการที่มีหลักฐานโอน' },
  { kind: 'merchants', format: 'csv', title: 'รายงานข้อมูลผู้ค้าส่งสรรพากร — CSV', hint: 'ยอดขายรายร้าน + เลขภาษี + บัญชีรับเงิน' },
];

export function TaxReportsPanel() {
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(currentMonth);
  const [from, setFrom] = useState(`${currentMonth()}-01`);
  const [to, setTo] = useState('');
  const [data, setData] = useState<TaxReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => (mode === 'month' ? { month } : { from, to: to || from }),
    [mode, month, from, to],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTaxReportSummary(query);
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดสรุปรายงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cards = data
    ? [
        { label: 'ยอดขายรวมทั้งระบบ', value: data.summary.grossVolume, tip: `${data.counts.ledgerRows} รายการ` },
        { label: 'รายได้ GP รวม', value: data.summary.gpInclusive, tip: `ก่อน VAT ${money(data.summary.gpTaxBase)}` },
        { label: 'ภาษีขาย 7%', value: data.summary.outputVat, tip: 'แยกจาก GP / 1.07' },
        { label: 'ยอดคืนเงินรวม', value: data.summary.refundGross, tip: `${data.counts.creditNoteRows} ใบลดหนี้` },
      ]
    : [];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[20px] font-semibold">รายงานบัญชีและภาษี</h2>
          <p className="mt-1 text-[13px] text-[#8b929a]">
            รายได้แพลตฟอร์มคือค่า GP เท่านั้น — ดูสรุปก่อน แล้วค่อยดาวน์โหลดส่งบัญชี
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg bg-[#f0f2f5] p-0.5 text-[13px]">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 font-semibold ${mode === 'month' ? 'bg-white text-[#141516]' : 'text-[#8b929a]'}`}
              onClick={() => setMode('month')}
            >
              รายเดือน
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 font-semibold ${mode === 'range' ? 'bg-white text-[#141516]' : 'text-[#8b929a]'}`}
              onClick={() => setMode('range')}
            >
              กำหนดช่วง
            </button>
          </div>
          {mode === 'month' ? (
            <input
              type="month"
              className="rounded-lg border border-[#141516]/12 bg-white px-3 py-2 text-[13px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          ) : (
            <>
              <input
                type="date"
                className="rounded-lg border border-[#141516]/12 bg-white px-3 py-2 text-[13px]"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <input
                type="date"
                className="rounded-lg border border-[#141516]/12 bg-white px-3 py-2 text-[13px]"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </>
          )}
          <button type="button" className="btn-secondary !rounded-lg !py-2 !text-[13px]" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'กำลังคำนวณ…' : 'คำนวณใหม่'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl bg-[#fde8ee] px-4 py-3 text-sm text-[#c81e4a]">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <article key={c.label} className="rounded-xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ring-[#141516]/8">
            <p className="text-[12px] font-medium text-[#8b929a]">{c.label}</p>
            <p className="font-display mt-2 text-[26px] font-semibold tracking-[-0.04em] tabular-nums">
              {loading ? '—' : money(c.value)}
            </p>
            <p className="mt-1 text-[12px] text-[#8b929a]">{c.tip}</p>
          </article>
        ))}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-[0_1px_2px_rgba(20,21,22,0.04)] ring-1 ring-[#141516]/8">
        <p className="text-[13px] font-semibold">ดาวน์โหลดไฟล์ส่งบัญชี</p>
        <p className="mt-1 text-[12px] text-[#8b929a]">
          ช่วง {data?.period.label ?? '—'} · {data?.counts.salesTaxRows ?? 0} รายการภาษีขาย · {data?.counts.creditNoteRows ?? 0}{' '}
          ลดหนี้
        </p>
        <ul className="mt-4 divide-y divide-[#141516]/8">
          {DOWNLOADS.map((row) => {
            const key = `${row.kind}-${row.format}`;
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-[13px] font-medium">{row.title}</p>
                  <p className="text-[12px] text-[#8b929a]">{row.hint}</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary !rounded-lg !py-2 !text-[13px]"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setBusy(key);
                    setError(null);
                    void downloadTaxReport(row.kind, row.format, query)
                      .catch((e) => setError(e instanceof Error ? e.message : 'ดาวน์โหลดไม่สำเร็จ'))
                      .finally(() => setBusy(null));
                  }}
                >
                  {busy === key ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด'}
                </button>
              </li>
            );
          })}
        </ul>
        {data?.note ? <p className="mt-3 text-[12px] leading-relaxed text-[#8b929a]">{data.note}</p> : null}
      </div>
    </section>
  );
}
