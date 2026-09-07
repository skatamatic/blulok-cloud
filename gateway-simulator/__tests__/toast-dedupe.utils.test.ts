import { describe, expect, it } from 'vitest';
import { buildToastDedupeKey, mergeToastPush } from '../src/renderer/utils/toast-dedupe.utils';
import type { ToastRecord } from '../src/renderer/contexts/toast.types';

function record(partial: Partial<ToastRecord> & Pick<ToastRecord, 'id' | 'title' | 'type'>): ToastRecord {
  return {
    dedupeKey: partial.dedupeKey ?? buildToastDedupeKey(partial),
    duration: 6500,
    expiresAt: Date.now(),
    count: partial.count ?? 1,
    message: partial.message,
    ...partial,
  };
}

describe('buildToastDedupeKey', () => {
  it('uses explicit dedupeKey when provided', () => {
    expect(buildToastDedupeKey({ type: 'error', title: 'A', dedupeKey: 'custom' })).toBe('custom');
  });

  it('derives key from type, title, and message', () => {
    expect(buildToastDedupeKey({ type: 'error', title: 'Failed', message: 'Offline' })).toBe(
      'error\u0000Failed\u0000Offline',
    );
  });
});

describe('mergeToastPush', () => {
  it('creates a new toast with count 1', () => {
    const result = mergeToastPush([], { type: 'error', title: 'Failed' }, 6500, () => 't-1', 1000);
    expect(result.toasts).toHaveLength(1);
    expect(result.toasts[0]?.count).toBe(1);
    expect(result.timer.id).toBe('t-1');
  });

  it('increments count for duplicate toasts and moves them to the front', () => {
    const existing = record({
      id: 't-1',
      type: 'error',
      title: 'Gateway failed',
      message: 'Offline',
      dedupeKey: 'error\u0000Gateway failed\u0000Offline',
      count: 2,
    });

    const result = mergeToastPush(
      [existing],
      { type: 'error', title: 'Gateway failed', message: 'Offline' },
      6500,
      () => 't-2',
      2000,
    );

    expect(result.toasts).toHaveLength(1);
    expect(result.toasts[0]?.id).toBe('t-1');
    expect(result.toasts[0]?.count).toBe(3);
    expect(result.timer.id).toBe('t-1');
  });

  it('groups by explicit dedupeKey even when message changes', () => {
    const existing = record({
      id: 'gw-error',
      type: 'error',
      title: 'Sim gateway connection failed',
      message: 'Attempt 1',
      dedupeKey: 'gateway-status:gw-1:error',
    });

    const result = mergeToastPush(
      [existing],
      {
        type: 'error',
        title: 'Sim gateway connection failed',
        message: 'Attempt 2',
        dedupeKey: 'gateway-status:gw-1:error',
      },
      6500,
      () => 'unused',
      3000,
    );

    expect(result.toasts[0]?.count).toBe(2);
    expect(result.toasts[0]?.message).toBe('Attempt 2');
  });
});
