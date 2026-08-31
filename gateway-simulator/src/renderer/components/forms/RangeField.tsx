import * as Slider from '@radix-ui/react-slider';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export function RangeField({
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  onChange,
}: Props) {
  const resolved = value ?? min;
  const clamped = Math.min(max, Math.max(min, resolved));
  const [draft, setDraft] = useState(String(clamped));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(clamped));
    }
  }, [clamped]);

  const commitDraft = useCallback(() => {
    const parsed = Number(draft.trim());
    if (!Number.isFinite(parsed)) {
      setDraft(String(clamped));
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    setDraft(String(next));
    if (next !== clamped) {
      onChange(next);
    }
  }, [clamped, draft, max, min, onChange]);

  return (
    <div className="range-field range-field-inline">
      <Slider.Root
        className="range-slider-root"
        value={[clamped]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([next]) => onChange(next)}
        aria-label={unit ? `Value in ${unit}` : 'Value'}
      >
        <Slider.Track className="range-slider-track">
          <Slider.Range className="range-slider-range" />
        </Slider.Track>
        <Slider.Thumb className="range-slider-thumb" />
      </Slider.Root>

      <div className="range-field-value-wrap">
        <input
          type="text"
          inputMode="decimal"
          className="range-field-input"
          value={draft}
          disabled={disabled}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
            commitDraft();
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
        />
        {unit && <span className="range-field-unit">{unit}</span>}
      </div>
    </div>
  );
}
