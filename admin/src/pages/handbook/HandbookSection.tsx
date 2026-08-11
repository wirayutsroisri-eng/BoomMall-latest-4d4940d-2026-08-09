type Props = {
  id: string;
  number: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function HandbookSection({ id, number, title, subtitle, children }: Props) {
  return (
    <section
      id={id}
      className="handbook-section break-inside-avoid rounded-3xl border border-[#122820]/10 bg-white/85 p-6 shadow-sm sm:p-8 print:break-before-page print:rounded-none print:border print:border-black/20 print:bg-white print:shadow-none print:first:break-before-auto"
    >
      <div className="mb-5 flex items-start gap-4 border-b border-[#122820]/10 pb-4 print:border-black/20">
        <span className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#122820] text-sm font-extrabold text-[#00d68f] print:bg-black print:text-white">
          {number}
        </span>
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#0b1f17]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-[#122820]/65">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="handbook-prose space-y-4 text-[15px] leading-relaxed text-[#122820]/90">
        {children}
      </div>
    </section>
  );
}

export function Callout({
  title,
  children,
  tone = 'mint',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'mint' | 'warn' | 'ink';
}) {
  const tones = {
    mint: 'border-[#00d68f]/35 bg-[#00d68f]/10',
    warn: 'border-amber-300 bg-amber-50',
    ink: 'border-[#122820]/15 bg-[#e8f2ec]',
  };
  return (
    <aside className={`rounded-2xl border px-4 py-3 ${tones[tone]} print:border-black/25`}>
      <p className="text-xs font-bold uppercase tracking-wider text-[#0b1f17]/70">{title}</p>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </aside>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#122820]/8 bg-[#f4faf6] px-3 py-2 print:bg-transparent">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-[#122820]/55">
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-[#0b1f17]">{value}</dd>
    </div>
  );
}
