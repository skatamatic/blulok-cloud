import { describe, expect, it, vi } from 'vitest';
import {
  isRetryableOperationalSyncFailure,
  retryOperationalSync,
} from '../src/main/net/operational-sync-retry.utils';

describe('operational-sync-retry.utils', () => {
  it('retries recovery_in_progress then succeeds', async () => {
    vi.useFakeTimers();
    const attempt = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, code: 'recovery_in_progress', message: 'blocked' })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const promise = retryOperationalSync(attempt, { delaysMs: [100] });
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not retry invalid_credential failures', async () => {
    const attempt = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      message: 'bad payload',
    });
    const result = await retryOperationalSync(attempt, { delaysMs: [100] });
    expect(result.ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('classifies not_bound_gateway as retryable', () => {
    expect(
      isRetryableOperationalSyncFailure({
        ok: false,
        status: 403,
        code: 'not_bound_gateway',
        message: 'not bound',
      }),
    ).toBe(true);
  });
});
