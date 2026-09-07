export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastInput = {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  /** Group duplicates; auto-derived from type+title+message when omitted. */
  dedupeKey?: string;
};

export type ToastRecord = ToastInput & {
  id: string;
  dedupeKey: string;
  duration: number;
  expiresAt: number;
  count: number;
};

export type ToastOptions = Pick<ToastInput, 'dedupeKey' | 'duration'>;
