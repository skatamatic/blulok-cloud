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
  if (!isOpen) return null;

  const confirmClass = confirmTone === 'danger'
    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400'
    : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-400';

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <button
            type="button"
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
    </div>
  );
}

