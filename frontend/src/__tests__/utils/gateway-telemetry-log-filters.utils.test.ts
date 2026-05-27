import {
  applyClientSideTelemetryFilters,
  datetimeLocalToIso,
  logMatchesFilters,
} from '@/utils/gateway-telemetry-log-filters.utils';
import type { GatewayTelemetryLogRecord } from '@/types/gateway.types';

const sampleLog = (overrides: Partial<GatewayTelemetryLogRecord> = {}): GatewayTelemetryLogRecord => ({
  id: 'log-1',
  gateway_id: 'gw-1',
  facility_id: 'fac-1',
  logged_at: '2026-05-26T12:00:00.000Z',
  payload: { header: '0201', data: { lock_id: 'abc-123' }, message: 'test' },
  source: 'gateway_ws',
  created_at: '2026-05-26T12:00:01.000Z',
  ...overrides,
});

describe('gateway-telemetry-log-filters.utils', () => {
  it('converts datetime-local to ISO UTC', () => {
    const iso = datetimeLocalToIso('2026-05-26T12:00');
    expect(iso).toBeDefined();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('matches payload path filters', () => {
    const log = sampleLog();
    expect(
      logMatchesFilters(log, {
        payloadFilters: [{ id: '1', path: 'data.lock_id', value: 'abc-123', op: 'eq' }],
      }),
    ).toBe(true);
    expect(
      logMatchesFilters(log, {
        payloadFilters: [{ id: '1', path: 'data.lock_id', value: 'missing', op: 'eq' }],
      }),
    ).toBe(false);
  });

  it('applies additional client-side payload filters when multiple chips active', () => {
    const logs = [
      sampleLog({ id: 'a', payload: { data: { lock_id: 'abc', tid: 1 } } }),
      sampleLog({ id: 'b', payload: { data: { lock_id: 'abc', tid: 2 } } }),
    ];
    const filtered = applyClientSideTelemetryFilters(logs, {
      payloadFilters: [
        { id: '1', path: 'data.lock_id', value: 'abc', op: 'eq' },
        { id: '2', path: 'data.tid', value: '2', op: 'eq' },
      ],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('b');
  });
});
