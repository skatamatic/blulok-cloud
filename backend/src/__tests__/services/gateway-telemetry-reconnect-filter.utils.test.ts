import {
  collectRoutineGatewayWsReconnectLogIds,
  filterRoutineGatewayWsReconnectLogs,
} from '@/utils/gateway-telemetry-system-log.utils';
import { GATEWAY_TELEMETRY_SYSTEM_HEADERS } from '@/constants/gateway-telemetry-system-log.constants';

function makeLifecycleLog(
  id: string,
  event: 'gateway_connected' | 'gateway_disconnected',
  loggedAt: string,
): {
  id: string;
  logged_at: Date;
  created_at: Date;
  source: string;
  payload: Record<string, unknown>;
} {
  const header =
    event === 'gateway_connected'
      ? GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_CONNECTED
      : GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_DISCONNECTED;

  return {
    id,
    logged_at: new Date(loggedAt),
    created_at: new Date(loggedAt),
    source: 'cloud_system',
    payload: {
      cloud_system: true,
      header,
      message: event,
      data: { cloud_system: true, event },
    },
  };
}

describe('gateway telemetry reconnect filter', () => {
  it('hides disconnect/connect pairs within 30 seconds', () => {
    const logs = [
      makeLifecycleLog('disc-1', 'gateway_disconnected', '2026-06-03T08:06:57.000Z'),
      makeLifecycleLog('conn-1', 'gateway_connected', '2026-06-03T08:07:02.000Z'),
      makeLifecycleLog('disc-2', 'gateway_disconnected', '2026-06-03T08:00:00.000Z'),
      makeLifecycleLog('conn-2', 'gateway_connected', '2026-06-03T08:01:00.000Z'),
    ];

    const hidden = collectRoutineGatewayWsReconnectLogIds(logs);
    expect(hidden.has('disc-1')).toBe(true);
    expect(hidden.has('conn-1')).toBe(true);
    expect(hidden.has('disc-2')).toBe(false);
    expect(hidden.has('conn-2')).toBe(false);

    const filtered = filterRoutineGatewayWsReconnectLogs(logs);
    expect(filtered.map((l) => l.id)).toEqual(['disc-2', 'conn-2']);
  });

  it('leaves unrelated gateway log lines untouched', () => {
    const logs = [
      makeLifecycleLog('disc-1', 'gateway_disconnected', '2026-06-03T08:06:57.000Z'),
      makeLifecycleLog('conn-1', 'gateway_connected', '2026-06-03T08:07:02.000Z'),
      {
        id: 'gw-1',
        logged_at: new Date('2026-06-03T08:07:03.000Z'),
        created_at: new Date('2026-06-03T08:07:03.000Z'),
        source: 'gateway_ws',
        payload: { message: 'Lock heartbeat OK' },
      },
    ];

    const filtered = filterRoutineGatewayWsReconnectLogs(logs);
    expect(filtered.map((l) => l.id)).toEqual(['gw-1']);
  });
});
