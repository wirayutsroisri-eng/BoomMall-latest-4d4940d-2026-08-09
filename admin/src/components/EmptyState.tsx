type Props = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: Props) {
  return (
    <div className="surface-panel max-w-xl p-8">
      <p className="font-display text-lg font-extrabold tracking-tight">{title}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{description}</p>
    </div>
  );
}
