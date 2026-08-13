import {
  inferCorrelatorDecision,
  jsonSafe,
  rowMatchesTraceFilters,
  traceEventMatchesFilters,
} from '@/utils/access-session-trace.utils';
import type { AccessSession } from '@/models/access-session.model';
import type { AccessSessionTraceEvent } from '@/services/access/access-session-trace.types';

function session(overrides: Partial<AccessSession> = {}): AccessSession {
  return {
    id: 's1',
    facility_id: 'fac-1',
    unit_id: 'unit-1',
    device_id: 'dev-1',
    device_type: 'blulok',
    gateway_id: 'gw-1',
    kind: 'access',
    origin: 'on_site',
    method: 'mobile_key',
    outcome: 'granted',
    state: 'pending',
    actor_type: 'user',
    actor_id: 'u1',
    actor_name: 'Tester',
    actor_role: 'tenant',
    denial_reason: null,
    reason_message: null,
    started_at: new Date('2026-08-12T19:21:00.000Z'),
    opened_at: null,
    closed_at: null,
    expires_at: null,
    settled_at: null,
    open_duration_sec: null,
    attempt_count: 1,
    remote_command_id: null,
    correlation_id: null,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('access-session-trace.utils', () => {
  it('infers duplicate on-site grant coalescing', () => {
    expect(
      inferCorrelatorDecision('grant', session({
        metadata: { coalesced_pending_grant: true },
        attempt_count: 2,
      })),
    ).toBe('coalesce_repeat_on_site_pending');
  });

  it('infers unlock-after-grant race', () => {
    expect(
      inferCorrelatorDecision('unlock', session({
        state: 'open',
        metadata: { unlocked_after_grant_race: true, discarded_local_open_id: 'local-1' },
      })),
    ).toBe('open_pending_after_grant_race');
  });

  it('serializes dates to ISO', () => {
    const out = jsonSafe({ when: new Date('2026-08-12T19:21:00.000Z') });
    expect(out.when).toBe('2026-08-12T19:21:00.000Z');
  });

  it('matches combined device+user filters', () => {
    const event: AccessSessionTraceEvent = {
      id: 'e1',
      kind: 'correlator_decision',
      at: new Date().toISOString(),
      facility_id: 'fac-1',
      gateway_id: 'gw-1',
      device_id: 'dev-1',
      unit_id: 'unit-1',
      user_id: 'u1',
      payload: {},
    };
    expect(traceEventMatchesFilters(event, {
      facility_id: 'fac-1',
      gateway_id: 'gw-1',
      device_id: 'dev-1',
      user_id: 'u1',
    })).toBe(true);
    expect(traceEventMatchesFilters(event, {
      facility_id: 'fac-1',
      device_id: 'dev-2',
    })).toBe(false);
  });

  it('scopes rows without gateway_id to gateway device set', () => {
    expect(rowMatchesTraceFilters(
      { facility_id: 'fac-1', gateway_id: null, device_id: 'dev-1' },
      { facility_id: 'fac-1', gateway_id: 'gw-1' },
      new Set(['dev-1']),
    )).toBe(true);
    expect(rowMatchesTraceFilters(
      { facility_id: 'fac-1', gateway_id: null, device_id: 'other' },
      { facility_id: 'fac-1', gateway_id: 'gw-1' },
      new Set(['dev-1']),
    )).toBe(false);
  });
});
