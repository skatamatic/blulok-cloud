export type ToastType = 'success' | 'info' | 'warning' | 'error' | 'critical';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // in milliseconds, 0 means no auto-dismiss
  persistent?: boolean; // true for critical errors that never auto-dismiss
  timestamp: number;
}

export interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => string;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}


