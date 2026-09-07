import {
  getAccessSessionRequestDetail,
  getAccessSessionOutcomeDisplay,
  getAccessSessionOutcomePillClass,
  getAccessSessionSubjectDisplay,
  getAccessSessionUserDisplay,
  OPEN_STALE_AFTER_SEC,
  OPEN_CRITICAL_AFTER_SEC,
  UNIDENTIFIED_USER_LABEL,
} from '@/utils/access-session-display.utils';
import { AccessSession } from '@/types/access-session.types';

function baseSession(overrides: Partial<AccessSession> = {}): AccessSession {
  return {
    id: 's1',
    kind: 'access',
    origin: 'on_site',
    method: 'keypad',
    outcome: 'granted',
    state: 'closed',
    device_id: 'd1',
    device_type: 'access_control',
    attempt_count: 1,
    started_at: '2026-08-05T04:00:00.000Z',
    opened_at: '2026-08-05T04:00:02.000Z',
    closed_at: '2026-08-05T04:01:00.000Z',
    ...overrides,
  };
}

describe('getAccessSessionUserDisplay', () => {
  it('marks keypad without a person as unidentified (not an error dash)', () => {
    const display = getAccessSessionUserDisplay(baseSession({ user_name: undefined }));
    expect(display.unidentified).toBe(true);
    expect(display.primary).toBe(UNIDENTIFIED_USER_LABEL);
  });

  it('ignores Unknown User placeholders', () => {
    const display = getAccessSessionUserDisplay(
      baseSession({ user_name: 'Unknown User', method: 'keypad' }),
    );
    expect(display.unidentified).toBe(true);
    expect(display.primary).toBe(UNIDENTIFIED_USER_LABEL);
  });

  it('returns a named user when present', () => {
    const display = getAccessSessionUserDisplay(
      baseSession({ user_name: 'Alex Rivera', user_email: 'alex@example.com' }),
    );
    expect(display.unidentified).toBe(false);
    expect(display.primary).toBe('Alex Rivera');
    expect(display.secondary).toBe('alex@example.com');
  });
});

describe('getAccessSessionRequestDetail', () => {
  it('uses via keypad when identity is unavailable', () => {
    expect(getAccessSessionRequestDetail(baseSession({ user_name: undefined }))).toBe(
      'via keypad',
    );
  });

  it('uses by name when identity is known', () => {
    expect(
      getAccessSessionRequestDetail(baseSession({ user_name: 'Alex Rivera', method: 'app' })),
    ).toBe('by Alex Rivera');
  });
});

describe('getAccessSessionSubjectDisplay', () => {
  it('prefers unit when present', () => {
    const display = getAccessSessionSubjectDisplay(
      baseSession({
        unit_id: 'u1',
        unit_number: 'A-101',
        device_name: 'Lock A',
        method: 'app',
        device_type: 'blulok',
      }),
      { hideFacility: true },
    );
    expect(display.primary).toBe('Unit A-101');
    expect(display.secondary).toBe('Lock A');
    expect(display.linkUnit).toBe(true);
  });

  it('uses keypad description when there is no unit', () => {
    const display = getAccessSessionSubjectDisplay(
      baseSession({
        unit_number: undefined,
        device_name: 'Gate Keypad',
        metadata: { description: 'Front lobby keypad' },
      }),
      { hideFacility: true },
    );
    expect(display.primary).toBe('Front lobby keypad');
    expect(display.linkUnit).toBe(false);
  });
});

describe('getAccessSessionOutcomeDisplay', () => {
  it('uses pending info tone for waiting', () => {
    const display = getAccessSessionOutcomeDisplay(
      baseSession({
        state: 'pending',
        outcome: null,
        opened_at: undefined,
        closed_at: undefined,
        expires_at: new Date(Date.now() + 30_000).toISOString(),
      }),
    );
    expect(display.tone).toBe('pending');
    expect(display.label).toMatch(/Waiting for unlock/);
  });

  it('uses timed_out warning tone', () => {
    const display = getAccessSessionOutcomeDisplay(
      baseSession({ state: 'timed_out', outcome: null, opened_at: undefined, closed_at: undefined }),
    );
    expect(display).toEqual({ label: 'Timed out', tone: 'timed_out' });
    expect(getAccessSessionOutcomePillClass(display.tone)).toMatch(/amber/);
  });

  it('marks open sessions past 10 minutes as possibly left open', () => {
    const openedAt = new Date(Date.now() - (OPEN_STALE_AFTER_SEC + 90) * 1000).toISOString();
    const display = getAccessSessionOutcomeDisplay(
      baseSession({
        state: 'open',
        outcome: 'granted',
        opened_at: openedAt,
        closed_at: undefined,
      }),
    );
    expect(display.tone).toBe('open_stale');
    expect(display.label).toMatch(/Possibly left open/);
  });

  it('escalates open sessions past 1 hour as left open (critical)', () => {
    const openedAt = new Date(Date.now() - (OPEN_CRITICAL_AFTER_SEC + 120) * 1000).toISOString();
    const display = getAccessSessionOutcomeDisplay(
      baseSession({
        state: 'open',
        outcome: 'granted',
        opened_at: openedAt,
        closed_at: undefined,
      }),
    );
    expect(display.tone).toBe('open_critical');
    expect(display.label).toMatch(/Left open/);
  });
});
