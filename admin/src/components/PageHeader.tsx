import { HelpPopover } from './HelpPopover';
import type { HELP } from '../lib/helpCatalog';

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  helpKey?: keyof typeof HELP;
};

export function PageHeader({ eyebrow, title, description, actions, helpKey }: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-2">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--ink)] sm:text-[2.1rem]">
            {title}
          </h1>
          {helpKey ? <HelpPopover helpKey={helpKey} /> : null}
        </div>
        {description ? (
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
