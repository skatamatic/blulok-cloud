import {
  computeLockCommandExpiresAt,
  lockCommandTimeoutMs,
  normalizeLockCommandTimeoutSec,
} from '@/utils/facility-lock-timeout.utils';

describe('facility-lock-timeout.utils', () => {
  it('defaults invalid values to 5 minutes', () => {
    expect(normalizeLockCommandTimeoutSec(undefined)).toBe(300);
    expect(normalizeLockCommandTimeoutSec('')).toBe(300);
    expect(normalizeLockCommandTimeoutSec('nope')).toBe(300);
  });

  it('allows 0 for one-shot commands', () => {
    expect(normalizeLockCommandTimeoutSec(0)).toBe(0);
    expect(normalizeLockCommandTimeoutSec(-5)).toBe(0);
    expect(lockCommandTimeoutMs(0)).toBe(0);
  });

  it('clamps values to the allowed range', () => {
    expect(normalizeLockCommandTimeoutSec(3)).toBe(3);
    expect(normalizeLockCommandTimeoutSec(9999)).toBe(3600);
    expect(normalizeLockCommandTimeoutSec(15.7)).toBe(16);
  });

  it('converts seconds to milliseconds', () => {
    expect(lockCommandTimeoutMs(12)).toBe(12_000);
  });

  describe('computeLockCommandExpiresAt', () => {
    it('returns now + normalized timeout in unix seconds', () => {
      const now = 1_700_000_000;
      expect(computeLockCommandExpiresAt(120, now)).toBe(now + 120);
      expect(computeLockCommandExpiresAt(undefined, now)).toBe(now + 300);
    });

    it('returns 0 when facility timeout is 0 (no expiry)', () => {
      expect(computeLockCommandExpiresAt(0, 1_700_000_000)).toBe(0);
    });
  });
});
