type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  labelOn?: string;
  labelOff?: string;
  /** Hide the on/off caption beside the switch (label comes from DeviceField). */
  compact?: boolean;
};

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  id,
  labelOn = 'On',
  labelOff = 'Off',
  compact = false,
}: Props) {
  return (
    <div className={`toggle-switch-wrap ${compact ? 'toggle-switch-wrap-compact' : ''}`}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={checked ? labelOn : labelOff}
        disabled={disabled}
        className="toggle-switch"
        data-checked={checked ? 'true' : 'false'}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span className="toggle-switch-knob" aria-hidden />
      </button>
      {!compact && (
        <span className={`toggle-switch-caption ${checked ? 'toggle-switch-caption-on' : ''}`}>
          {checked ? labelOn : labelOff}
        </span>
      )}
    </div>
  );
}
