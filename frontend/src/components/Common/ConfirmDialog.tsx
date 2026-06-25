import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'primary' | 'danger';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  footerExtra?: ReactNode;
}

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
  footerExtra,
}: ConfirmDialogProps) {
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

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpen, isLoading, onCancel]);

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
      ? 'btn-danger'
      : 'btn-primary';

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (isLoading) return;
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
          {footerExtra && <div className="mt-4">{footerExtra}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <button
            type="button"
            data-confirm-dialog-cancel
            onClick={onCancel}
            disabled={isLoading}
            className="btn-secondary !px-3 !py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`${confirmClass} !px-3 !py-2 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
