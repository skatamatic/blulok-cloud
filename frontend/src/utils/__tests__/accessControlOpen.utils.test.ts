import {
  computeOpenUntilUnixSec,
  isSupportsWidgetTimedOpenEnabled,
  WIDGET_TIMED_OPEN_MAX_MINUTES,
} from '@/utils/accessControlOpen.utils';

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
  it('adds duration minutes in UTC seconds', () => {
    const nowMs = 1_700_000_000_000;
    expect(computeOpenUntilUnixSec(5, nowMs)).toBe(1_700_000_000 + 5 * 60);
  });

  it('clamps to widget max minutes', () => {
    const nowMs = 1_700_000_000_000;
    expect(computeOpenUntilUnixSec(999, nowMs)).toBe(
      1_700_000_000 + WIDGET_TIMED_OPEN_MAX_MINUTES * 60,
    );
  });
});
