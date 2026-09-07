import { filterRoutineGatewayWsReconnectLogs } from '@/utils/gateway-telemetry-reconnect-filter.utils';
import type { GatewayTelemetryLogRecord } from '@/types/gateway.types';

function makeLifecycleLog(
  id: string,
  event: 'gateway_connected' | 'gateway_disconnected',
  loggedAt: string,
): GatewayTelemetryLogRecord {
  return {
    id,
    gateway_id: 'gw-1',
    facility_id: 'fac-1',
    logged_at: loggedAt,
    created_at: loggedAt,
    source: 'cloud_system',
    payload: {
      cloud_system: true,
      header: event === 'gateway_connected' ? 'CLD01' : 'CLD02',
      data: { event },
    },
  };
}

describe('gateway-telemetry-reconnect-filter.utils', () => {
  it('hides short disconnect/connect cycles', () => {
    const logs = [
      makeLifecycleLog('disc', 'gateway_disconnected', '2026-06-03T08:06:57.000Z'),
      makeLifecycleLog('conn', 'gateway_connected', '2026-06-03T08:07:02.000Z'),
    ];

    expect(filterRoutineGatewayWsReconnectLogs(logs)).toEqual([]);
  });
});
