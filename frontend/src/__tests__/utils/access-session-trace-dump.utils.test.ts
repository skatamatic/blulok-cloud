import {
  buildAccessSessionTraceDump,
  eventMatchesClientFilters,
  formatTraceLookup,
  lookupUsersToFilterUsers,
  traceRowMatchesUser,
} from '@/utils/access-session-trace-dump.utils';
import type {
  AccessSessionTraceEvent,
  AccessSessionTraceSnapshot,
} from '@/types/access-session-trace.types';

const lookups: AccessSessionTraceSnapshot['lookups'] = {
  devices: {
    'dev-aaaa-bbbb': {
      id: 'dev-aaaa-bbbb',
      device_type: 'blulok',
      unit_number: '102',
    },
    'dev-named': {
      id: 'dev-named',
      device_type: 'access_control',
      name: 'Front gate',
    },
    'dev-serial': {
      id: 'dev-serial',
      device_type: 'blulok',
      serial: 'SN-9',
    },
  },
  units: {
    'unit-1': { id: 'unit-1', unit_number: '108' },
  },
  users: {
    u1: { id: 'u1', name: 'Tester One', email: 't1@blulok.com' },
    u2: { id: 'u2', name: 'No Email' },
  },
};

describe('access-session-trace-dump.utils', () => {
  it('builds a dump with snapshot, live events, and lock states', () => {
    const dump = buildAccessSessionTraceDump({
      snapshot: null,
      liveEvents: [
        {
          id: 'e1',
          kind: 'correlator_decision',
          at: '2026-08-12T19:21:00.000Z',
          payload: {},
        },
      ],
      lockStates: [
        {
          id: 'dev-1',
          device_type: 'blulok',
          lock_status: 'locked',
        },
      ],
    });
    const parsed = JSON.parse(dump);
    expect(parsed.snapshot).toBeNull();
    expect(parsed.live_events_since_snapshot).toHaveLength(1);
    expect(parsed.lock_states_live[0].lock_status).toBe('locked');
    expect(parsed.captured_at_client).toEqual(expect.any(String));
  });

  it('formats device/unit/user lookups with fallbacks', () => {
    expect(formatTraceLookup(undefined, 'device', 'dev-x')).toBe('dev-x');
    expect(formatTraceLookup(lookups, 'device', null)).toBe('—');
    expect(formatTraceLookup(lookups, 'device', 'missing')).toBe('missing');
    expect(formatTraceLookup(lookups, 'device', 'dev-aaaa-bbbb')).toContain('Unit 102');
    expect(formatTraceLookup(lookups, 'device', 'dev-named')).toContain('Front gate');
    expect(formatTraceLookup(lookups, 'device', 'dev-serial')).toContain('SN-9');
    expect(formatTraceLookup(lookups, 'unit', 'unit-1')).toBe('Unit 108');
    expect(formatTraceLookup(lookups, 'unit', 'missing')).toBe('missing');
    expect(formatTraceLookup(lookups, 'user', 'u1')).toBe('t1@blulok.com');
    expect(formatTraceLookup(lookups, 'user', 'u2')).toBe('No Email');
    expect(formatTraceLookup(lookups, 'user', 'missing')).toBe('missing');
  });

  it('filters events by unit/user/device when ids are present', () => {
    const event: AccessSessionTraceEvent = {
      id: 'e1',
      kind: 'raw_access_event',
      at: '2026-08-12T19:21:00.000Z',
      unit_id: 'unit-1',
      user_id: 'u1',
      device_id: 'dev-1',
      payload: {},
    };
    expect(eventMatchesClientFilters(event, { unit_id: '', user_id: '' })).toBe(true);
    expect(eventMatchesClientFilters(event, { unit_id: 'unit-1', user_id: 'u1' })).toBe(true);
    expect(eventMatchesClientFilters(event, { unit_id: 'other', user_id: '' })).toBe(false);
    expect(eventMatchesClientFilters(event, { unit_id: '', user_id: 'other' })).toBe(false);
    expect(
      eventMatchesClientFilters(event, { unit_id: '', user_id: '', device_id: 'other' }),
    ).toBe(false);
    expect(
      eventMatchesClientFilters(
        { ...event, device_id: undefined },
        { unit_id: '', user_id: '', device_id: 'other' },
      ),
    ).toBe(true);
  });

  it('maps lookup users for UserFilter allowedUsers', () => {
    expect(lookupUsersToFilterUsers(undefined)).toEqual([]);
    expect(lookupUsersToFilterUsers(lookups.users)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'u1', email: 't1@blulok.com' }),
        expect.objectContaining({ id: 'u2', name: 'No Email' }),
      ]),
    );
  });

  it('matches rows by actor_id, user_id, or initiator', () => {
    expect(traceRowMatchesUser({}, '')).toBe(true);
    expect(traceRowMatchesUser({ actor_id: 'u1' }, 'u1')).toBe(true);
    expect(traceRowMatchesUser({ user_id: 'u1' }, 'u1')).toBe(true);
    expect(traceRowMatchesUser({ initiator: { userId: 'u1' } }, 'u1')).toBe(true);
    expect(traceRowMatchesUser({ actor_id: 'u2' }, 'u1')).toBe(false);
  });
});
