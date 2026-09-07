import {
  computeOpenUntilUnixSec,
  isSupportsWidgetTimedOpenEnabled,
  validateAccessControlOpenUntil,
} from '@/utils/access-control-open.utils';

describe('isSupportsWidgetTimedOpenEnabled', () => {
  it('accepts boolean true and MySQL-style 1', () => {
    expect(isSupportsWidgetTimedOpenEnabled(true)).toBe(true);
    expect(isSupportsWidgetTimedOpenEnabled(1)).toBe(true);
  });

  it('rejects falsey values', () => {
    expect(isSupportsWidgetTimedOpenEnabled(false)).toBe(false);
    expect(isSupportsWidgetTimedOpenEnabled(0)).toBe(false);
  });
});

describe('computeOpenUntilUnixSec', () => {
  it('adds duration minutes to now', () => {
    const nowMs = 1_700_000_000_000;
    expect(computeOpenUntilUnixSec(5, nowMs)).toBe(1_700_000_000 + 5 * 60);
  });
});

describe('validateAccessControlOpenUntil', () => {
  const now = 1_700_000_000;

  it('allows omitted open_until', () => {
    expect(
      validateAccessControlOpenUntil(undefined, {
        lockStatus: 'unlocked',
        supportsWidgetTimedOpen: false,
        nowUnixSec: now,
      }).ok,
    ).toBe(true);
  });

  it('rejects open_until when timed open is disabled on device', () => {
    const result = validateAccessControlOpenUntil(now + 300, {
      lockStatus: 'unlocked',
      supportsWidgetTimedOpen: false,
      nowUnixSec: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/not enabled/i);
    }
  });

  it('accepts future open_until when feature enabled', () => {
    const result = validateAccessControlOpenUntil(now + 300, {
      lockStatus: 'unlocked',
      supportsWidgetTimedOpen: true,
      nowUnixSec: now,
    });
    expect(result).toEqual({ ok: true, openUntil: now + 300 });
  });

  it('rejects open_until on lock commands', () => {
    const result = validateAccessControlOpenUntil(now + 300, {
      lockStatus: 'locked',
      supportsWidgetTimedOpen: true,
      nowUnixSec: now,
    });
    expect(result.ok).toBe(false);
  });
});
