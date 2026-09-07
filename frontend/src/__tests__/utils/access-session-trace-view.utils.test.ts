import {
  buildTraceEventLog,
  buildWovenTraceItems,
  countLiveDeviceOverlaps,
  eventsToNdjson,
  lockStatusStrip,
  mergeTraceSessions,
} from '@/utils/access-session-trace-view.utils';
import type { AccessSessionTraceEvent, AccessSessionTraceRow } from '@/types/access-session-trace.types';

const liveSession: AccessSessionTraceRow = {
  id: 's-live',
  state: 'pending',
  device_id: 'dev-1',
  unit_number: '102',
  started_at: '2026-08-13T01:00:00.000Z',
};

const recentClosed: AccessSessionTraceRow = {
  id: 's-closed',
  state: 'closed',
  device_id: 'dev-1',
  unit_number: '102',
  started_at: '2026-08-13T00:00:00.000Z',
};

const liveEvent: AccessSessionTraceEvent = {
  id: 'e-live',
  kind: 'correlator_decision',
  decision: 'create_on_site_pending',
  at: '2026-08-13T01:00:01.000Z',
  device_id: 'dev-1',
  payload: { hook: 'grant' },
};

describe('access-session-trace-view.utils', () => {
  it('merges live and historical sessions without duplicating ids', () => {
    const rows = mergeTraceSessions([liveSession], [liveSession, recentClosed]);
    expect(rows.map((row) => row.id)).toEqual(['s-live', 's-closed']);
    expect(rows[0].isLive).toBe(true);
    expect(rows[1].isLive).toBe(false);
  });

  it('weaves live events, historical activity, and lock state', () => {
    const items = buildWovenTraceItems({
      liveEvents: [liveEvent],
      correlatorDecisions: [liveEvent],
      rawEvents: [
        {
          id: 'act-1',
          activity_type: 'unlock',
          title: 'Unlocked',
          occurred_at: '2026-08-13T00:59:00.000Z',
          device_id: 'dev-1',
          unit_number: '102',
        },
      ],
      lockStates: [{ id: 'dev-1', device_type: 'blulok', unit_number: '102', lock_status: 'locked' }],
      capturedAt: '2026-08-13T01:00:02.000Z',
    });

    expect(items.some((item) => item.id === 'e-live' && item.source === 'live')).toBe(true);
    expect(items.filter((item) => item.id === 'e-live')).toHaveLength(1);
    expect(items.some((item) => item.kind === 'lock_unlock_event' && item.source === 'history')).toBe(true);
    expect(items.some((item) => item.kind === 'lock_state')).toBe(true);
  });

  it('formats events as oldest-first pretty NDJSON without a woven wrapper', () => {
    const later: AccessSessionTraceEvent = {
      ...liveEvent,
      id: 'e-later',
      at: '2026-08-13T01:00:05.000Z',
      decision: 'open_pending',
    };
    const dump = eventsToNdjson(
      buildTraceEventLog({
        liveEvents: [later, liveEvent],
        correlatorDecisions: [liveEvent],
        rawEvents: [
          {
            id: 'act-1',
            activity_type: 'unlock',
            title: 'Unlocked',
            occurred_at: '2026-08-13T00:59:00.000Z',
            device_id: 'dev-1',
          },
        ],
      }),
    );
    const blocks = dump.split('\n\n');

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain('"id": "act-1"');
    expect(blocks[1]).toContain('"id": "e-live"');
    expect(blocks[2]).toContain('"id": "e-later"');
    expect(dump).not.toContain('"woven"');
    expect(dump).not.toContain('"filters"');
    expect(JSON.parse(blocks[0]).kind).toBe('lock_unlock_event');
    expect(blocks[0]).toMatch(/\n {2}"kind":/);
  });

  it('summarizes lock status on the unit or as device counts, never as a gateway lock', () => {
    expect(
      lockStatusStrip([{ id: 'dev-1', device_type: 'blulok', unit_number: '102', lock_status: 'locked' }]),
    ).toEqual({ label: 'Unit 102', value: 'locked' });
    expect(
      lockStatusStrip([
        { id: 'dev-1', device_type: 'blulok', unit_number: '102', lock_status: 'locked' },
        { id: 'dev-2', device_type: 'blulok', unit_number: '108', lock_status: 'unlocked' },
      ]),
    ).toEqual({ label: 'Device locks', value: '1 locked · 1 unlocked' });
    expect(lockStatusStrip([])).toEqual({ label: 'Device locks', value: '—' });
    expect(lockStatusStrip([]).label).not.toBe('Gateway');
    expect(
      countLiveDeviceOverlaps([
        { id: 'a', state: 'pending', device_id: 'dev-1' },
        { id: 'b', state: 'open', device_id: 'dev-1' },
        { id: 'c', state: 'closed', device_id: 'dev-1' },
      ]),
    ).toBe(1);
  });
});
