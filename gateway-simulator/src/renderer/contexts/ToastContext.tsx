import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ToastViewport } from '../components/ToastViewport';
import type { ToastInput, ToastOptions, ToastRecord, ToastType } from './toast.types';
import { mergeToastPush } from '../utils/toast-dedupe.utils';

export type { ToastInput, ToastOptions, ToastRecord, ToastType } from './toast.types';

type ToastContextValue = {
  push: (input: ToastInput) => void;
  dismiss: (id: string) => void;
  success: (title: string, message?: string, options?: ToastOptions) => void;
  error: (title: string, message?: string, options?: ToastOptions) => void;
  warning: (title: string, message?: string, options?: ToastOptions) => void;
  info: (title: string, message?: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const MAX_TOASTS = 4;
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4200,
  error: 6500,
  warning: 5200,
  info: 4200,
};

function createToastId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const rescheduleDismiss = useCallback(
    (id: string, duration: number) => {
      const existingTimer = timersRef.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const push = useCallback(
    (input: ToastInput) => {
      const duration = input.duration ?? DEFAULT_DURATIONS[input.type];
      let timerTarget: { id: string; duration: number } | null = null;

      setToasts((prev) => {
        const result = mergeToastPush(prev, input, duration, createToastId);
        timerTarget = result.timer;
        return result.toasts;
      });

      if (timerTarget) {
        rescheduleDismiss(timerTarget.id, timerTarget.duration);
      }
    },
    [rescheduleDismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss,
      success: (title, message, options) => push({ type: 'success', title, message, ...options }),
      error: (title, message, options) => push({ type: 'error', title, message, ...options }),
      warning: (title, message, options) => push({ type: 'warning', title, message, ...options }),
      info: (title, message, options) => push({ type: 'info', title, message, ...options }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
