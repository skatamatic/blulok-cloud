import {
  accessLogFromActivityWsData,
  accessSessionFromWsData,
  matchesAccessHistoryLiveFilters,
  parseActivityWsEnvelope,
  upsertAccessSession,
} from '@/utils/access-history-live.utils';
import { localDateInputToUtcEndIso, localDateInputToUtcStartIso } from '@/utils/datetime.utils';
import { AccessLog } from '@/types/access-history.types';
import { AccessSession } from '@/types/access-session.types';

const sampleLog: AccessLog = {
  id: 'log-1',
  device_id: 'dev-1',
  device_type: 'blulok',
  facility_id: 'fac-1',
  unit_id: 'unit-1',
  user_id: 'user-1',
  action: 'unlock',
  method: 'app',
  success: true,
  occurred_at: '2026-06-16T18:00:00.000Z',
  created_at: '2026-06-16T18:00:00.000Z',
  updated_at: '2026-06-16T18:00:00.000Z',
  unit_number: '101',
  user_name: 'Pat Smith',
};

describe('access-history-live.utils', () => {
  it('parses activity_new envelope with accessLog payload', () => {
    const envelope = parseActivityWsEnvelope({
      eventType: 'activity_new',
      payload: {
        accessLog: sampleLog,
      },
    });
    expect(envelope.eventType).toBe('activity_new');
    expect(accessLogFromActivityWsData(envelope.payload)).toMatchObject({
      id: 'log-1',
      action: 'unlock',
    });
  });

  it('matches date_to through end of local calendar day', () => {
    const localDay = '2026-06-16';
    const startIso = localDateInputToUtcStartIso(localDay);
    const endIso = localDateInputToUtcEndIso(localDay);
    const log: AccessLog = {
      ...sampleLog,
      occurred_at: endIso,
    };

    expect(
      matchesAccessHistoryLiveFilters(log, {
        date_from: localDay,
        date_to: localDay,
      }),
    ).toBe(true);

    expect(
      matchesAccessHistoryLiveFilters(
        { ...log, occurred_at: new Date(new Date(startIso).getTime() - 1).toISOString() },
        { date_from: localDay, date_to: localDay },
      ),
    ).toBe(false);
  });

  it('ignores invalid date filter strings without throwing', () => {
    expect(
      matchesAccessHistoryLiveFilters(sampleLog, {
        date_from: 'not-a-date',
      }),
    ).toBe(true);
  });

  it('ignores transitional lock activity types from websocket payloads', () => {
    expect(
      accessLogFromActivityWsData({
        activity: {
          id: 'log-locking',
          activityType: 'locking',
          result: 'pending',
        },
      }),
    ).toBeNull();
  });

  it('maps legacy automatic method to local_device', () => {
    expect(
      accessLogFromActivityWsData({
        accessLog: {
          id: 'log-2',
          action: 'unlock',
          method: 'automatic',
          success: true,
          occurred_at: '2026-06-16T18:00:00.000Z',
          created_at: '2026-06-16T18:00:00.000Z',
          updated_at: '2026-06-16T18:00:00.000Z',
          device_id: 'dev-1',
        },
      }),
    ).toMatchObject({ method: 'local_device' });
  });

  it('treats access_denied filter as unlock_attempt alias', () => {
    const deniedLog: AccessLog = {
      ...sampleLog,
      id: 'log-denied',
      action: 'unlock_attempt',
      success: false,
    };
    expect(
      matchesAccessHistoryLiveFilters(deniedLog, { action: 'access_denied' }),
    ).toBe(true);
  });

  it('matches cloud filter to admin_remote and remote_gateway', () => {
    expect(
      matchesAccessHistoryLiveFilters(
        { ...sampleLog, method: 'admin_remote' },
        { method: 'cloud' },
      ),
    ).toBe(true);
    expect(
      matchesAccessHistoryLiveFilters(
        { ...sampleLog, method: 'remote_gateway' },
        { method: 'cloud' },
      ),
    ).toBe(true);
    expect(
      matchesAccessHistoryLiveFilters(
        { ...sampleLog, method: 'app' },
        { method: 'cloud' },
      ),
    ).toBe(false);
  });

  it('preserves settlement_mismatch denial reason from websocket payloads', () => {
    expect(
      accessLogFromActivityWsData({
        accessLog: {
          id: 'log-settle',
          action: 'unlock_attempt',
          method: 'admin_remote',
          success: false,
          denial_reason: 'settlement_mismatch',
          occurred_at: '2026-06-16T18:00:00.000Z',
          created_at: '2026-06-16T18:00:00.000Z',
          updated_at: '2026-06-16T18:00:00.000Z',
          device_id: 'dev-1',
        },
      }),
    ).toMatchObject({ denial_reason: 'settlement_mismatch' });
  });

  it('upserts access sessions by id and caps length', () => {
    const a: AccessSession = {
      id: 's1',
      kind: 'access',
      origin: 'cloud_remote',
      method: 'admin_remote',
      outcome: null,
      state: 'pending',
      device_id: 'd1',
      device_type: 'blulok',
      attempt_count: 1,
      started_at: '2026-06-16T18:00:00.000Z',
    };
    const b: AccessSession = { ...a, id: 's2', state: 'open' };
    const updated: AccessSession = {
      ...a,
      state: 'open',
      opened_at: '2026-06-16T18:00:05.000Z',
    };

    expect(upsertAccessSession([], a, 2)).toEqual([a]);
    expect(upsertAccessSession([a], updated, 2)).toEqual([updated]);
    expect(upsertAccessSession([a], b, 2)).toEqual([b, a]);
    const capped = upsertAccessSession([a, b], { ...a, id: 's3' }, 2);
    expect(capped).toHaveLength(2);
    expect(capped[0].id).toBe('s3');
  });

  it('parses access_session_upsert payload', () => {
    const session = accessSessionFromWsData({
      session: {
        id: 'sess-1',
        kind: 'access',
        origin: 'on_site',
        method: 'keypad',
        outcome: 'granted',
        state: 'closed',
        device_id: 'dev-9',
        device_type: 'blulok',
        attempt_count: 2,
        started_at: '2026-06-16T18:00:00.000Z',
      },
      changed: ['state'],
    });
    expect(session).toMatchObject({
      id: 'sess-1',
      method: 'keypad',
      state: 'closed',
      attempt_count: 2,
    });
  });
});
