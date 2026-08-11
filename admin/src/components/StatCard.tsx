type Props = {
  label: string;
  value: string;
  hint?: string;
  accent?: 'mint' | 'ink' | 'warn' | 'danger';
};

const accents = {
  mint: 'from-[#00d68f]/25 to-transparent border-[#00d68f]/40',
  ink: 'from-[#122820]/15 to-transparent border-[#122820]/20',
  warn: 'from-amber-400/25 to-transparent border-amber-400/40',
  danger: 'from-rose-500/20 to-transparent border-rose-400/40',
};

export function StatCard({ label, value, hint, accent = 'ink' }: Props) {
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br ${accents[accent]} bg-white/70 p-5 shadow-sm backdrop-blur`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#122820]/65">
        {label}
      </p>
      <p className="font-display mt-2 text-3xl font-extrabold tracking-tight text-[#0b1f17]">
        {value}
      </p>
      {hint ? <p className="mt-2 text-sm text-[#122820]/70">{hint}</p> : null}
    </div>
  );
}
