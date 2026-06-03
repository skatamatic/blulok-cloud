import {
  lockCommandTimeoutMs,
  normalizeLockCommandTimeoutSec,
} from '@/utils/facility-lock-timeout.utils';

describe('facility-lock-timeout.utils', () => {
  it('defaults invalid values to 10 seconds', () => {
    expect(normalizeLockCommandTimeoutSec(undefined)).toBe(10);
    expect(normalizeLockCommandTimeoutSec('')).toBe(10);
    expect(normalizeLockCommandTimeoutSec('nope')).toBe(10);
  });

  it('clamps values to the allowed range', () => {
    expect(normalizeLockCommandTimeoutSec(3)).toBe(5);
    expect(normalizeLockCommandTimeoutSec(999)).toBe(120);
    expect(normalizeLockCommandTimeoutSec(15.7)).toBe(16);
  });

  it('converts seconds to milliseconds', () => {
    expect(lockCommandTimeoutMs(12)).toBe(12_000);
  });
});
