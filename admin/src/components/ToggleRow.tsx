type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
};

export function ToggleRow({ checked, onChange, label, hint }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <p className="text-[15px] font-semibold text-[var(--ink)]">{label}</p>
        {hint ? <p className="mt-0.5 text-sm text-[var(--ink-tertiary)]">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="toggle"
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
