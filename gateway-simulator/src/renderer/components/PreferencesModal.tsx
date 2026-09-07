import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import { useTheme, type ThemePreference } from '../contexts/ThemeContext';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  Icon: typeof SunIcon;
}> = [
  {
    value: 'light',
    label: 'Light',
    description: 'Always use light mode',
    Icon: SunIcon,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use dark mode',
    Icon: MoonIcon,
  },
  {
    value: 'system',
    label: 'System',
    description: 'Match your OS appearance',
    Icon: ComputerDesktopIcon,
  },
];

export function PreferencesModal({ isOpen, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    panelRef.current.querySelector<HTMLElement>('[data-preferences-close]')?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-dialog-title"
        className="confirm-dialog-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          <h3 id="preferences-dialog-title" className="confirm-dialog-title">
            Preferences
          </h3>
        </div>

        <div className="confirm-dialog-body">
          <fieldset className="theme-selector-fieldset">
            <legend className="label mb-3">Appearance</legend>
            <div className="theme-selector" role="radiogroup" aria-label="Theme">
              {THEME_OPTIONS.map(({ value, label, description, Icon }) => {
                const selected = theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`theme-selector-option${selected ? ' theme-selector-option-active' : ''}`}
                    onClick={() => setTheme(value)}
                  >
                    <span className="theme-selector-option-icon-wrap" aria-hidden>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="theme-selector-option-copy">
                      <span className="theme-selector-option-label">{label}</span>
                      <span className="theme-selector-option-description">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="confirm-dialog-footer">
          <button
            type="button"
            data-preferences-close
            className="btn-secondary !px-3 !py-2"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
