import {
  formatLockCommandTimeoutLabel,
  isOneShotLockCommandTimeout,
  normalizeLockCommandTimeoutSec,
  resolveLockCommandTimeoutMs,
} from '@/utils/facilityLockTimeout.utils';

describe('facilityLockTimeout.utils', () => {
  it('defaults invalid values to 10 seconds', () => {
    expect(normalizeLockCommandTimeoutSec(undefined)).toBe(10);
    expect(normalizeLockCommandTimeoutSec('')).toBe(10);
  });

  it('allows 0 for one-shot commands', () => {
    expect(normalizeLockCommandTimeoutSec(0)).toBe(0);
    expect(isOneShotLockCommandTimeout(0)).toBe(true);
    expect(resolveLockCommandTimeoutMs(0)).toBe(0);
  });

  it('clamps to one hour maximum', () => {
    expect(normalizeLockCommandTimeoutSec(7200)).toBe(3600);
    expect(resolveLockCommandTimeoutMs(3600)).toBe(3_600_000);
  });

  it('formats labels for display', () => {
    expect(formatLockCommandTimeoutLabel(0)).toMatch(/disabled/i);
    expect(formatLockCommandTimeoutLabel(3600)).toBe('1 hour');
    expect(formatLockCommandTimeoutLabel(120)).toBe('2 minutes');
  });
});
