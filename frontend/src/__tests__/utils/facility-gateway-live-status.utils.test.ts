import {
  resolveEffectiveGatewayStatus,
} from '@/utils/facility-gateway-live-status.utils';

describe('resolveEffectiveGatewayStatus', () => {
  it('uses inbound websocket for physical gateways when session is up', () => {
    expect(
      resolveEffectiveGatewayStatus({
        dbStatus: 'offline',
        wsConnected: true,
        gatewayType: 'physical',
      }),
    ).toBe('online');
  });

  it('shows offline for physical gateways when websocket session is down', () => {
    expect(
      resolveEffectiveGatewayStatus({
        dbStatus: 'online',
        wsConnected: false,
        gatewayType: 'physical',
      }),
    ).toBe('offline');
  });

  it('keeps HTTP gateway inventory status even when inbound websocket is connected', () => {
    expect(
      resolveEffectiveGatewayStatus({
        dbStatus: 'offline',
        wsConnected: true,
        gatewayType: 'http',
      }),
    ).toBe('offline');
  });

  it('preserves maintenance and error states', () => {
    expect(
      resolveEffectiveGatewayStatus({
        dbStatus: 'maintenance',
        wsConnected: true,
        gatewayType: 'physical',
      }),
    ).toBe('maintenance');

    expect(
      resolveEffectiveGatewayStatus({
        dbStatus: 'error',
        wsConnected: false,
        gatewayType: 'simulated',
      }),
    ).toBe('error');
  });
});
