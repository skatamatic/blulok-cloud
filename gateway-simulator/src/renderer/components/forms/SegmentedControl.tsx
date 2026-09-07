export type SegmentOption<T extends string = string> = {
  value: T;
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  /** Use neutral highlight for all active segments (cleaner in dense toolbars). */
  muteTones?: boolean;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  size = 'sm',
  fullWidth = false,
  muteTones = false,
}: Props<T>) {
  return (
    <div
      className={`segmented-control ${size === 'sm' ? 'segmented-control-sm' : 'segmented-control-md'} ${fullWidth ? 'segmented-control-full' : ''}`}
      role="group"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const tone = muteTones ? 'neutral' : (opt.tone ?? 'neutral');
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            className={`segmented-option ${active ? `segmented-option-active segmented-option-${tone}` : ''}`}
            onClick={() => !disabled && onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
