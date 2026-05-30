import {
  mapGatewayLockStateFieldsToDbUpdate,
  resolveOutboundGatewayLockNumber,
} from '@/utils/gateway-lock-state-map.utils';

describe('gateway-lock-state-map.utils', () => {
  describe('mapGatewayLockStateFieldsToDbUpdate', () => {
    it('maps state enum to lock_status', () => {
      expect(mapGatewayLockStateFieldsToDbUpdate({ state: 'CLOSED' })).toEqual({
        lock_status: 'locked',
      });
      expect(mapGatewayLockStateFieldsToDbUpdate({ state: 'OPENED' })).toEqual({
        lock_status: 'unlocked',
      });
    });

    it('maps telemetry and aliases temperature_value', () => {
      expect(
        mapGatewayLockStateFieldsToDbUpdate({
          online: true,
          battery_level: 3400,
          signal_strength: -60,
          temperature_value: 22.5,
          firmware_version: '1.0.0',
          error_code: null,
          error_message: null,
        }),
      ).toEqual({
        device_status: 'online',
        battery_level: 3400,
        signal_strength: -60,
        temperature: 22.5,
        firmware_version: '1.0.0',
        error_code: null,
        error_message: null,
      });
    });

    it('returns empty object when no fields provided', () => {
      expect(mapGatewayLockStateFieldsToDbUpdate({})).toEqual({});
    });
  });

  describe('resolveOutboundGatewayLockNumber', () => {
    it('reads lockNumber and lock_number', () => {
      expect(resolveOutboundGatewayLockNumber({ lockNumber: 495 })).toBe(495);
      expect(resolveOutboundGatewayLockNumber({ lock_number: '101' })).toBe(101);
    });
  });
});
