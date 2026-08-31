import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type DontAskAgainProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
};

type Props = {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'primary' | 'danger';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  dontAskAgain?: DontAskAgainProps;
  children?: ReactNode;
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
  dontAskAgain,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isLoading) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, isLoading, onCancel]);

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
    panelRef.current.querySelector<HTMLElement>('[data-confirm-dialog-cancel]')?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const confirmClass = confirmTone === 'danger' ? 'btn-danger' : 'btn-primary';

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (isLoading) return;
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="confirm-dialog-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          <h3 id="confirm-dialog-title" className="confirm-dialog-title">
            {title}
          </h3>
        </div>
        <div className="confirm-dialog-body">
          <div id="confirm-dialog-message" className="confirm-dialog-message">
            {message}
          </div>
          {children}
          {dontAskAgain && (
            <label className="confirm-dialog-dont-ask">
              <input
                type="checkbox"
                className="confirm-dialog-dont-ask-input"
                checked={dontAskAgain.checked}
                disabled={isLoading}
                onChange={(event) => dontAskAgain.onChange(event.target.checked)}
              />
              <span>{dontAskAgain.label ?? "Don't ask me again"}</span>
            </label>
          )}
        </div>
        <div className="confirm-dialog-footer">
          <button
            type="button"
            data-confirm-dialog-cancel
            className="btn-secondary !px-3 !py-2"
            disabled={isLoading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${confirmClass} !px-3 !py-2`}
            disabled={isLoading}
            onClick={onConfirm}
          >
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
