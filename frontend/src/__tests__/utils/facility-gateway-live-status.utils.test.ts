import {
  resolveEffectiveGatewayStatus,
} from '@/utils/facility-gateway-live-status.utils';

describe('resolveEffectiveGatewayStatus', () => {
  it('reports online whenever the live inbound session is connected (any gateway type)', () => {
    expect(
      resolveEffectiveGatewayStatus({ dbStatus: 'offline', connected: true }),
    ).toBe('online');
  });

  it('reports offline when the live session is confirmed down', () => {
    expect(
      resolveEffectiveGatewayStatus({ dbStatus: 'online', connected: false }),
    ).toBe('offline');
  });

  it('falls back to the last persisted DB status while liveness is unknown', () => {
    expect(
      resolveEffectiveGatewayStatus({ dbStatus: 'online', connected: null }),
    ).toBe('online');
    expect(
      resolveEffectiveGatewayStatus({ dbStatus: 'offline', connected: null }),
    ).toBe('offline');
    expect(
      resolveEffectiveGatewayStatus({ dbStatus: undefined, connected: null }),
    ).toBe('offline');
  });

  it('preserves admin-set maintenance and error states over live connectivity', () => {
    expect(
      resolveEffectiveGatewayStatus({ dbStatus: 'maintenance', connected: true }),
    ).toBe('maintenance');

    expect(
      resolveEffectiveGatewayStatus({ dbStatus: 'error', connected: false }),
    ).toBe('error');
  });
});
