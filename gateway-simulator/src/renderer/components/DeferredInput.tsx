import { useEffect, useRef, useState } from 'react';

type TextProps = {
  value: string | undefined;
  disabled?: boolean;
  placeholder?: string;
  onCommit: (value: string) => void;
};

/** Text input that keeps local draft while focused; commits to parent on blur/Enter. */
export function DeferredTextInput({ value, disabled, placeholder, onCommit }: TextProps) {
  const [draft, setDraft] = useState(value ?? '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value ?? '');
    }
  }, [value]);

  const commit = () => {
    const next = draft;
    if (next !== (value ?? '')) {
      onCommit(next);
    }
  };

  return (
    <input
      className="input input-compact"
      type="text"
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

type NumberProps = {
  value: number | undefined;
  disabled?: boolean;
  onCommit: (value: number | undefined) => void;
};

/** Number input with local draft; commits parsed value on blur/Enter. */
export function DeferredNumberInput({ value, disabled, onCommit }: NumberProps) {
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value != null ? String(value) : '');
    }
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    const parsed = trimmed === '' ? undefined : Number(trimmed);
    const normalized = parsed != null && Number.isFinite(parsed) ? parsed : undefined;
    if (normalized !== value) {
      onCommit(normalized);
    }
  };

  return (
    <input
      className="input input-compact"
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
