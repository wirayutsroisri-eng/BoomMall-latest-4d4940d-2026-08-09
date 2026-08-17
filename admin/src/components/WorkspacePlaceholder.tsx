import { Link } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import type { HELP } from '../lib/helpCatalog';

type Props = {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaTo?: string;
  helpKey?: keyof typeof HELP;
};

/** Honest empty / upcoming workspace — no fake success claims */
export function WorkspacePlaceholder({ title, description, ctaLabel, ctaTo, helpKey }: Props) {
  return (
    <div>
      <PageHeader title={title} description={description} helpKey={helpKey} />
      <div className="surface-panel max-w-2xl p-8">
        <p className="text-sm font-semibold text-[var(--ink-secondary)]">
          พื้นที่นี้พร้อมสำหรับทีมปฏิบัติการ — ยังไม่แสดงตัวเลขจำลอง
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-tertiary)]">
          เมื่อเชื่อมข้อมูลจริงแล้ว การ์ดและเครื่องมือจะแสดงที่นี่แบบ Drill-down
        </p>
        {ctaLabel && ctaTo ? (
          <Link to={ctaTo} className="btn-primary mt-6 inline-flex">
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
