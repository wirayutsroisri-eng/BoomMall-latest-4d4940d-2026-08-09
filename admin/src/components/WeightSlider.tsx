type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
};

export function WeightSlider({ label, value, onChange, max = 100 }: Props) {
  return (
    <div className="py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold text-[var(--ink)]">{label}</p>
        <p className="font-display text-lg font-extrabold tabular-nums text-[var(--ink)]">
          {value}%
        </p>
      </div>
      <input
        className="weight-slider"
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}
