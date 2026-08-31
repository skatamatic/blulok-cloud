import type { ToastInput, ToastRecord } from '../contexts/toast.types';

export function buildToastDedupeKey(input: Pick<ToastInput, 'type' | 'title' | 'message' | 'dedupeKey'>): string {
  if (input.dedupeKey) return input.dedupeKey;
  return `${input.type}\u0000${input.title}\u0000${input.message ?? ''}`;
}

export type MergeToastPushResult = {
  toasts: ToastRecord[];
  timer: { id: string; duration: number };
};

export function mergeToastPush(
  prev: ToastRecord[],
  input: ToastInput,
  duration: number,
  createId: () => string,
  now = Date.now(),
  maxToasts = 4,
): MergeToastPushResult {
  const dedupeKey = buildToastDedupeKey(input);
  const existing = prev.find((toast) => toast.dedupeKey === dedupeKey);

  if (existing) {
    const updated: ToastRecord = {
      ...existing,
      type: input.type,
      title: input.title,
      message: input.message ?? existing.message,
      duration,
      count: existing.count + 1,
      expiresAt: now + duration,
    };
    return {
      toasts: [updated, ...prev.filter((toast) => toast.id !== existing.id)],
      timer: { id: existing.id, duration },
    };
  }

  const next: ToastRecord = {
    ...input,
    id: createId(),
    dedupeKey,
    duration,
    count: 1,
    expiresAt: now + duration,
  };

  return {
    toasts: [next, ...prev].slice(0, maxToasts),
    timer: { id: next.id, duration },
  };
}
