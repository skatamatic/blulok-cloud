import {
  isGatewayReachable,
  resolveEffectiveAccessControlStatus,
  resolveEffectiveBluLokDeviceStatus,
  resolveEffectiveInfraStatus,
  resolveGatewayUnreachableReason,
} from '@/utils/device-reachability.utils';

describe('device-reachability.utils', () => {
  describe('isGatewayReachable', () => {
    it('returns true when live connected', () => {
      expect(isGatewayReachable({ dbStatus: 'offline', connected: true })).toBe(true);
    });

    it('returns false when live disconnected during grace', () => {
      expect(isGatewayReachable({ dbStatus: 'online', connected: false })).toBe(false);
    });

    it('returns false for maintenance and error admin states', () => {
      expect(isGatewayReachable({ dbStatus: 'maintenance', connected: true })).toBe(false);
      expect(isGatewayReachable({ dbStatus: 'error', connected: true })).toBe(false);
    });

    it('falls back to DB status when connected is null', () => {
      expect(isGatewayReachable({ dbStatus: 'online', connected: null })).toBe(true);
      expect(isGatewayReachable({ dbStatus: 'offline', connected: null })).toBe(false);
    });
  });

  describe('resolveGatewayUnreachableReason', () => {
    it('maps maintenance and error', () => {
      expect(resolveGatewayUnreachableReason({ dbStatus: 'maintenance', connected: true })).toBe(
        'gateway_maintenance',
      );
      expect(resolveGatewayUnreachableReason({ dbStatus: 'error', connected: true })).toBe(
        'gateway_error',
      );
    });

    it('maps live disconnect to gateway_offline', () => {
      expect(resolveGatewayUnreachableReason({ dbStatus: 'online', connected: false })).toBe(
        'gateway_offline',
      );
    });
  });

  describe('resolveEffectiveBluLokDeviceStatus', () => {
    const offlineGw = { dbStatus: 'online' as const, connected: false as const };

    it('coerces online and low_battery when gateway unreachable', () => {
      expect(resolveEffectiveBluLokDeviceStatus('online', offlineGw)).toEqual({
        effective: 'offline',
        reported: 'online',
        status_unreachable_reason: 'gateway_offline',
      });
      expect(resolveEffectiveBluLokDeviceStatus('low_battery', offlineGw)).toEqual({
        effective: 'offline',
        reported: 'low_battery',
        status_unreachable_reason: 'gateway_offline',
      });
    });

    it('leaves error and offline unchanged when gateway unreachable', () => {
      expect(resolveEffectiveBluLokDeviceStatus('error', offlineGw).effective).toBe('error');
      expect(resolveEffectiveBluLokDeviceStatus('offline', offlineGw).effective).toBe('offline');
      expect(resolveEffectiveBluLokDeviceStatus('error', offlineGw).status_unreachable_reason).toBeNull();
    });

    it('passes through when gateway reachable', () => {
      const reachable = { dbStatus: 'online' as const, connected: true as const };
      expect(resolveEffectiveBluLokDeviceStatus('online', reachable)).toEqual({
        effective: 'online',
        reported: 'online',
        status_unreachable_reason: null,
      });
    });
  });

  describe('resolveEffectiveAccessControlStatus', () => {
    const offlineGw = { dbStatus: 'online' as const, connected: false as const };

    it('coerces online when gateway unreachable', () => {
      expect(resolveEffectiveAccessControlStatus('online', offlineGw)).toEqual({
        effective: 'offline',
        reported: 'online',
        status_unreachable_reason: 'gateway_offline',
      });
    });

    it('passes through offline when gateway unreachable', () => {
      expect(resolveEffectiveAccessControlStatus('offline', offlineGw).effective).toBe('offline');
    });
  });

  describe('resolveEffectiveInfraStatus', () => {
    const offlineGw = { dbStatus: 'online' as const, connected: false as const };

    it('coerces healthy state to offline effective status', () => {
      expect(resolveEffectiveInfraStatus('healthy', offlineGw)).toEqual({
        effective: 'offline',
        reported: 'online',
        status_unreachable_reason: 'gateway_offline',
      });
    });

    it('passes through error state', () => {
      const result = resolveEffectiveInfraStatus('error', offlineGw);
      expect(result.effective).toBe('error');
      expect(result.status_unreachable_reason).toBeNull();
    });
  });
});
