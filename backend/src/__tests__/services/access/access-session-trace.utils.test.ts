import {
  activityKind,
  findSessionsSharingDevice,
  inferCorrelatorDecision,
  jsonSafe,
  rowMatchesTraceFilters,
  summarizeActivity,
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

  it('covers remaining correlator decision branches', () => {
    expect(inferCorrelatorDecision('grant', null)).toBe('grant:no_session');
    expect(
      inferCorrelatorDecision('grant', session({ metadata: { absorbed_local_open: true } })),
    ).toBe('absorb_recent_local_open');
    expect(
      inferCorrelatorDecision('grant', session({ metadata: { on_site_grant_method: 'app' } })),
    ).toBe('attach_pending_cloud_remote');
    expect(
      inferCorrelatorDecision('grant', session({ state: 'open', attempt_count: 2 })),
    ).toBe('coalesce_repeat_grant_into_open');
    expect(
      inferCorrelatorDecision('grant', session({ state: 'pending', origin: 'on_site' })),
    ).toBe('create_on_site_pending');
    expect(
      inferCorrelatorDecision('grant', session({ state: 'denied', origin: 'cloud_remote' })),
    ).toBe('grant:cloud_remote:denied');

    expect(
      inferCorrelatorDecision('unlock', session({ origin: 'local', state: 'open' })),
    ).toBe('create_local_open');
    expect(inferCorrelatorDecision('unlock', session({ state: 'open' }))).toBe('open_pending');
    expect(inferCorrelatorDecision('unlock', session({ state: 'pending' }))).toBe(
      'unlock:on_site:pending',
    );

    expect(
      inferCorrelatorDecision('lock', session({ metadata: { synthesized_from_lock: true } })),
    ).toBe('synthesize_closed_from_lock');
    expect(
      inferCorrelatorDecision('lock', session({ metadata: { locked_without_open: true } })),
    ).toBe('close_pending_without_open');
    expect(inferCorrelatorDecision('lock', session({ state: 'closed' }))).toBe(
      'close_open_session',
    );
    expect(inferCorrelatorDecision('lock', session({ state: 'open' }))).toBe('lock:on_site:open');

    expect(inferCorrelatorDecision('denial', session())).toBe('create_denied');
    expect(inferCorrelatorDecision('cloud_remote_issued', session())).toBe(
      'create_or_reuse_cloud_remote_pending',
    );
    expect(inferCorrelatorDecision('confirm_locked', session({ state: 'closed' }))).toBe(
      'confirm_locked:closed',
    );
    expect(
      inferCorrelatorDecision('expire', session({ state: 'timed_out', denial_reason: 'timeout' })),
    ).toBe('expire:timed_out:timeout');
    expect(inferCorrelatorDecision('fail_or_timeout', session({ state: 'failed' }))).toBe(
      'fail_or_timeout:failed:none',
    );
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
    expect(traceEventMatchesFilters(event, { facility_id: 'other' })).toBe(false);
    expect(traceEventMatchesFilters(event, { gateway_id: 'other' })).toBe(false);
    expect(traceEventMatchesFilters(event, { unit_id: 'other' })).toBe(false);
    expect(traceEventMatchesFilters(event, { user_id: 'other' })).toBe(false);
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
    expect(rowMatchesTraceFilters(
      { facility_id: 'fac-1', gateway_id: 'gw-2', device_id: 'dev-1' },
      { gateway_id: 'gw-1' },
    )).toBe(false);
    expect(rowMatchesTraceFilters(
      { facility_id: 'fac-1', device_id: 'dev-2', unit_id: 'u2', actor_id: 'a2' },
      { facility_id: 'fac-1', device_id: 'dev-1' },
    )).toBe(false);
    expect(rowMatchesTraceFilters(
      { facility_id: 'other', device_id: 'dev-1' },
      { facility_id: 'fac-1' },
    )).toBe(false);
  });

  it('clusters sessions that share a device', () => {
    const clustered = findSessionsSharingDevice([
      session({ id: 'a', device_id: 'dev-1', state: 'closed' }),
      session({
        id: 'b',
        device_id: 'dev-1',
        state: 'open',
        started_at: '2026-08-12T18:00:00.000Z' as unknown as Date,
      }),
      session({ id: 'c', device_id: 'dev-2', state: 'pending' }),
    ]);
    expect(clustered).toHaveLength(1);
    expect(clustered[0].device_id).toBe('dev-1');
    expect(clustered[0].session_ids).toEqual(['a', 'b']);
    expect(clustered[0].states).toEqual(['closed', 'open']);
  });

  it('classifies and summarizes activity rows', () => {
    expect(activityKind('lock')).toBe('lock_unlock_event');
    expect(activityKind('unlock')).toBe('lock_unlock_event');
    expect(activityKind('access_attempt')).toBe('raw_access_event');
    expect(
      summarizeActivity({
        id: 'act-1',
        activity_type: 'unlock',
        title: 'Unlocked',
        description: 'ok',
        result: 'success',
        result_message: null,
        actor_type: 'user',
        actor_id: 'u1',
        actor_name: 'Ada',
        actor_user_email: 'a@b.com',
        facility_id: 'fac-1',
        unit_id: 'unit-1',
        unit_number: '102',
        device_id: 'dev-1',
        device_serial: 'SN',
        access_session_id: 'sess-1',
        occurred_at: '2026-08-12T19:21:00.000Z',
        metadata: { x: 1 },
      } as any),
    ).toEqual(
      expect.objectContaining({
        id: 'act-1',
        activity_type: 'unlock',
        unit_number: '102',
        access_session_id: 'sess-1',
      }),
    );
  });
});
