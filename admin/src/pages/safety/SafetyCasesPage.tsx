import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmSheet, type ConfirmRequest } from '../../components/ConfirmSheet';
import { TermTip } from '../../components/TermTip';
import {
  actSafetyCase,
  fetchSafetyCases,
  type SafetyCase,
} from '../../lib/safetyApi';

const PRIMARY: Array<{ id: string; label: string; confirm?: ConfirmRequest }> = [
  {
    id: 'allow',
    label: 'ไม่พบความผิด',
  },
  {
    id: 'warn',
    label: 'เตือน',
    confirm: {
      title: 'เตือนผู้ใช้นี้?',
      effects: ['ระบบส่งคำเตือนไปยังบัญชี', 'เคสถูกบันทึกประวัติ', 'ยังใช้งานได้ตามปกติ'],
      confirmLabel: 'ยืนยันเตือน',
      requireReason: true,
    },
  },
  {
    id: 'limit_reach',
    label: 'จำกัดการมองเห็น',
    confirm: {
      title: 'จำกัดการมองเห็นคอนเทนต์นี้?',
      effects: ['คนอื่นเห็นคอนเทนต์ได้น้อยลง', 'เจ้าของบัญชียังเห็นของตนเองได้', 'สามารถปลดได้ภายหลัง'],
      confirmLabel: 'ยืนยันจำกัด',
      requireReason: true,
    },
  },
];

const ADVANCED: Array<{ id: string; label: string; confirm: ConfirmRequest }> = [
  {
    id: 'hide',
    label: 'ซ่อน',
    confirm: {
      title: 'ซ่อนคอนเทนต์นี้?',
      effects: ['คอนเทนต์ไม่แสดงในฟีดสาธารณะ', 'ยังกู้คืนได้จากคิวตรวจ'],
      confirmLabel: 'ยืนยันซ่อน',
      requireReason: true,
    },
  },
  {
    id: 'remove',
    label: 'ลบ',
    confirm: {
      title: 'ลบคอนเทนต์นี้?',
      effects: ['คอนเทนต์ถูกเอาออกจากฟีด', 'การลบถูกบันทึกใน Audit Log', 'ผู้ใช้อาจอุทธรณ์ได้'],
      confirmLabel: 'ยืนยันลบ',
      requireReason: true,
      danger: true,
    },
  },
  {
    id: 'restrict_user',
    label: 'จำกัดบัญชี',
    confirm: {
      title: 'จำกัดบัญชีนี้?',
      effects: ['โพสต์และแชตถูกจำกัด', 'ออเดอร์เดิมยังอยู่', 'ปลดจำกัดได้ภายหลัง'],
      confirmLabel: 'ยืนยันจำกัดบัญชี',
      requireReason: true,
      danger: true,
    },
  },
  {
    id: 'suspend',
    label: 'ระงับ',
    confirm: {
      title: 'ระงับบัญชีนี้?',
      effects: [
        'ผู้ใช้ไม่สามารถขายหรือโพสต์ได้',
        'ออเดอร์เดิมยังคงอยู่',
        'เงินใน Escrow จะไม่ถูกลบ',
        'สามารถปลดระงับภายหลังได้',
      ],
      confirmLabel: 'ยืนยันระงับ',
      requireReason: true,
      danger: true,
    },
  },
];

function riskTone(band: string) {
  const b = band.toLowerCase();
  if (b.includes('crit') || b.includes('high')) return 'danger';
  if (b.includes('med') || b.includes('mid')) return 'warn';
  return 'ok';
}

export function SafetyCasesPage() {
  const [rows, setRows] = useState<SafetyCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; action: string; req: ConfirmRequest } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openMore, setOpenMore] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows((await fetchSafetyCases()).data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดเคสไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (id: string, action: string, reason?: string) => {
    setBusy(true);
    try {
      await actSafetyCase(id, action, reason);
      setPending(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const requestAct = (id: string, action: string, confirm?: ConfirmRequest) => {
    if (confirm) {
      setPending({ id, action, req: confirm });
      return;
    }
    void run(id, action);
  };

  return (
    <div>
      <PageHeader
        eyebrow="ภาพรวม"
        title="ศูนย์จัดการเคส"
        description="รวมรายงานจากผู้ใช้ แชต คอนเทนต์ และความเสี่ยงทางการเงินเป็นเคสเดียว — ตัดสินใจที่นี่ ไม่ต้องไล่หลายหน้า"
        helpKey="cases"
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {rows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีเคสที่ต้องจัดการ"
          description="เมื่อมีรายงานจากผู้ใช้ ระบบจะรวมเป็นเคสที่นี่เอง พร้อมคะแนนความเสี่ยงและคำแนะนำจาก AI ซึ่งเป็นเพียงข้อเสนอ ไม่ใช่คำตัดสินสุดท้าย"
        />
      ) : (
        <div className="space-y-4">
          {rows.map((c) => (
            <article key={c.id} className="surface-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[var(--ink-tertiary)]">CASE #{c.id}</p>
                  <h3 className="font-display mt-1 text-xl font-extrabold">
                    {c.userId ?? 'ไม่ระบุผู้ใช้'} · {c.status}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                    รายงาน {c.reportIds.length} ครั้ง · ประวัติก่อนหน้า {c.previousViolations} ครั้ง
                  </p>
                </div>
                <span className={`status-pill ${riskTone(c.risk.band)}`}>
                  <TermTip term="risk">{c.risk.band}</TermTip> · {c.risk.score}/100
                </span>
              </div>

              {c.aiRecommendation ? (
                <div className="mt-4 rounded-[14px] bg-[var(--bg)] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
                    AI Recommendation — ไม่ใช่คำตัดสินสุดท้าย
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold">{c.aiRecommendation.action}</p>
                  <p className="mt-1 text-sm text-[var(--ink-secondary)]">
                    มั่นใจ {c.aiRecommendation.confidence}% · {c.aiRecommendation.reason}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {c.userId ? (
                  <Link to={`/safety/users/${encodeURIComponent(c.userId)}`} className="btn-secondary !text-xs">
                    ดูหลักฐาน
                  </Link>
                ) : null}
                {PRIMARY.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="btn-secondary !text-xs"
                    onClick={() => requestAct(c.id, a.id, a.confirm)}
                  >
                    {a.label}
                  </button>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    onClick={() => setOpenMore((id) => (id === c.id ? null : c.id))}
                  >
                    ⋯
                  </button>
                  {openMore === c.id ? (
                    <div className="absolute right-0 z-10 mt-1 min-w-[160px] rounded-[12px] border border-[var(--line)] bg-white p-1 shadow-[var(--shadow-md)]">
                      {ADVANCED.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="block w-full rounded-[10px] px-3 py-2 text-left text-xs font-bold hover:bg-[var(--bg)]"
                          onClick={() => {
                            setOpenMore(null);
                            requestAct(c.id, a.id, a.confirm);
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--ink-secondary)]">
                  ดูรายละเอียด
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-[var(--ink-tertiary)]">
                  {c.timeline.map((t, i) => (
                    <li key={`${t.at}-${i}`}>
                      {new Date(t.at).toLocaleString('th-TH')} · {t.actor} · {t.event}{' '}
                      {t.detail ? `· ${t.detail}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
      )}

      <ConfirmSheet
        open={Boolean(pending)}
        request={pending?.req ?? null}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => {
          if (!pending) return;
          void run(pending.id, pending.action, reason);
        }}
      />
    </div>
  );
}
