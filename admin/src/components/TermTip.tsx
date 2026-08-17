import { useState } from 'react';
import { TERMS, type TermEntry } from '../lib/helpCatalog';

type Props = {
  term: keyof typeof TERMS;
  children?: React.ReactNode;
};

export function TermTip({ term, children }: Props) {
  const entry: TermEntry | undefined = TERMS[term];
  const [open, setOpen] = useState(false);
  if (!entry) return <>{children}</>;

  return (
    <span className="term-tip">
      {children ?? <span className="font-semibold">{entry.label}</span>}
      <button
        type="button"
        className="term-tip-btn"
        aria-label={`${entry.label}: ${entry.tip}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        ⓘ
      </button>
      {open ? <span className="term-tip-bubble">{entry.tip}</span> : null}
    </span>
  );
}
