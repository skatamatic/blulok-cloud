import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { ToastRecord } from '../contexts/toast.types';

type Props = {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
};

const ICONS: Record<ToastRecord['type'], typeof CheckCircleIcon> = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
};

export function ToastViewport({ toasts, onDismiss }: Props) {
  if (!toasts.length) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions text">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
            <Icon className="toast-icon" aria-hidden />
            <div className="toast-copy">
              <div className="toast-title-row">
                <p className="toast-title">{toast.title}</p>
                {toast.count > 1 && (
                  <span className="toast-count" aria-label={`${toast.count} occurrences`}>
                    ×{toast.count}
                  </span>
                )}
              </div>
              {toast.message && <p className="toast-message">{toast.message}</p>}
            </div>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
            >
              <XMarkIcon className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
