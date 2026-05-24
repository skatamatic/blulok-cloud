import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const cancelButton = panelRef.current.querySelector<HTMLElement>(
      '[data-confirm-dialog-cancel]'
    );
    cancelButton?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const confirmClass =
    confirmTone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400'
      : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-400';

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h3
            id="confirm-dialog-title"
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            {title}
          </h3>
        </div>
        <div className="px-5 py-4">
          <p id="confirm-dialog-message" className="text-sm text-gray-700 dark:text-gray-300">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <button
            type="button"
            data-confirm-dialog-cancel
            onClick={onCancel}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
