import {
  formatAccessDeviceListSubtitle,
  isGatewaySyncProvisioned,
} from '@/utils/accessDeviceDisplay.utils';

describe('accessDeviceDisplay.utils', () => {
  describe('formatAccessDeviceListSubtitle', () => {
    it('joins serial and relay channel', () => {
      expect(
        formatAccessDeviceListSubtitle({
          device_serial: 'KP-001',
          relay_channel: 3,
          location_description: 'Lobby',
        })
      ).toBe('KP-001 · Relay 3');
    });

    it('falls back to location when serial missing', () => {
      expect(
        formatAccessDeviceListSubtitle({
          device_serial: '',
          relay_channel: 1,
          location_description: 'Side door',
        })
      ).toBe('Relay 1');
    });

    it('returns em dash when nothing is available', () => {
      expect(
        formatAccessDeviceListSubtitle({
          device_serial: '',
          relay_channel: undefined as unknown as number,
          location_description: '',
        })
      ).toBe('—');
    });
  });

  describe('isGatewaySyncProvisioned', () => {
    it('detects createdFromGatewaySync', () => {
      expect(isGatewaySyncProvisioned({ createdFromGatewaySync: true })).toBe(true);
    });

    it('returns false for manual devices', () => {
      expect(isGatewaySyncProvisioned({ manuallyAdded: true })).toBe(false);
      expect(isGatewaySyncProvisioned(undefined)).toBe(false);
    });
  });
});
