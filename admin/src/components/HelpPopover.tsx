import { useEffect, useId, useRef, useState } from 'react';
import { HELP, type HelpEntry } from '../lib/helpCatalog';

type Props = {
  helpKey: keyof typeof HELP;
  className?: string;
};

export function HelpPopover({ helpKey, className = '' }: Props) {
  const entry = HELP[helpKey];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!entry) return null;

  return (
    <div ref={wrapRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        className="help-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`คำอธิบาย: ${entry.title}`}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open ? <HelpCard id={id} entry={entry} /> : null}
    </div>
  );
}

export function HelpCard({ id, entry }: { id?: string; entry: HelpEntry }) {
  return (
    <div id={id} role="dialog" className="help-pop">
      <p className="text-[13px] font-extrabold text-[var(--ink)]">{entry.title}</p>
      <dl className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
            คืออะไร
          </dt>
          <dd className="mt-0.5 text-[var(--ink-secondary)]">{entry.what}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
            ใช้ทำอะไร
          </dt>
          <dd className="mt-0.5 text-[var(--ink-secondary)]">{entry.why}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">
            ควรใช้เมื่อใด
          </dt>
          <dd className="mt-0.5 text-[var(--ink-secondary)]">{entry.when}</dd>
        </div>
        {entry.impact ? (
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--danger)]">
              มีผลอะไร
            </dt>
            <dd className="mt-0.5 text-[var(--ink-secondary)]">{entry.impact}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
