import { IconChevron } from './icons';

type Props = {
  title: string;
  subtitle?: React.ReactNode;
  value: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
};

export function SummaryCard({
  title,
  subtitle,
  value,
  delta,
  deltaTone = 'neutral',
  onClick,
}: Props) {
  const deltaColor =
    deltaTone === 'up'
      ? 'text-[var(--ok)]'
      : deltaTone === 'down'
        ? 'text-[var(--danger)]'
        : 'text-[var(--ink-tertiary)]';

  return (
    <button type="button" className="summary-card group" onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-[var(--ink-secondary)]">{title}</p>
        <IconChevron className="h-4 w-4 text-[var(--ink-tertiary)] opacity-0 transition group-hover:opacity-100" />
      </div>
      <p className="font-display mt-4 text-[2rem] font-extrabold leading-none tracking-tight text-[var(--ink)]">
        {value}
      </p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
        {delta ? (
          <p className={`text-sm font-semibold ${deltaColor}`}>{delta}</p>
        ) : (
          <span />
        )}
        {subtitle ? (
          <p className="text-xs font-medium text-[var(--ink-tertiary)]">{subtitle}</p>
        ) : null}
      </div>
    </button>
  );
}
