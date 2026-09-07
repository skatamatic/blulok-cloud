import {
  buildGatewayTelemetrySystemLogPayload,
  formatGatewayDisconnectReason,
} from '@/utils/gateway-telemetry-system-log.utils';
import { GATEWAY_TELEMETRY_SYSTEM_HEADERS } from '@/constants/gateway-telemetry-system-log.constants';

describe('gateway-telemetry-system-log.utils', () => {
  it('builds Header/message/data payload with cloud_system provenance', () => {
    const payload = buildGatewayTelemetrySystemLogPayload({
      event: 'gateway_connected',
      message: 'Gateway inbound WebSocket connected (cloud system)',
      facility_id: 'fac-1',
      gateway_id: 'gw-1',
      reason: 'auth_ok',
      user_id: 'user-1',
      remote_address: '127.0.0.1',
    });

    expect(payload).toEqual({
      header: GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_CONNECTED,
      message: 'Gateway inbound WebSocket connected (cloud system)',
      cloud_system: true,
      data: {
        cloud_system: true,
        event: 'gateway_connected',
        facility_id: 'fac-1',
        gateway_id: 'gw-1',
        reason: 'auth_ok',
        user_id: 'user-1',
        remote_address: '127.0.0.1',
      },
    });
  });

  it('adds reason_label on disconnect events', () => {
    const payload = buildGatewayTelemetrySystemLogPayload({
      event: 'gateway_disconnected',
      message: 'Disconnected',
      facility_id: 'fac-1',
      gateway_id: 'gw-1',
      reason: 'heartbeat_timeout',
    });

    expect(payload.header).toBe(GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_DISCONNECTED);
    expect(payload.data).toMatchObject({
      reason: 'heartbeat_timeout',
      reason_label: 'Heartbeat timeout (no gateway activity)',
    });
  });

  it('formats unknown disconnect reasons', () => {
    expect(formatGatewayDisconnectReason('custom_reason')).toBe('custom reason');
    expect(formatGatewayDisconnectReason('replaced')).toBe(
      'Superseded by a newer gateway connection',
    );
  });
});
