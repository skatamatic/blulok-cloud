import {
  formatAccessDeviceListSubtitle,
  formatAccessDevicePageTitle,
  isGatewaySyncProvisioned,
  isManuallyAddedDevice,
} from '@/utils/accessDeviceDisplay.utils';

describe('accessDeviceDisplay.utils', () => {
  describe('formatAccessDevicePageTitle', () => {
    it('prefers name, then location, then relay, then device type', () => {
      expect(formatAccessDevicePageTitle({ name: 'Main Door' })).toBe('Main Door');
      expect(
        formatAccessDevicePageTitle({
          location_description: 'Lobby',
          relay_channel: 2,
          device_type: 'door',
        }),
      ).toBe('Lobby');
      expect(
        formatAccessDevicePageTitle({ relay_channel: 2, device_type: 'gate' }),
      ).toBe('Relay 2');
      expect(formatAccessDevicePageTitle({ device_type: 'elevator' })).toBe('Elevator');
      expect(formatAccessDevicePageTitle({})).toBe('Access device');
    });
  });

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
      expect(isGatewaySyncProvisioned({ createdFromGatewaySync: true, manuallyAdded: false })).toBe(
        true,
      );
    });

    it('returns false for manual devices', () => {
      expect(isGatewaySyncProvisioned({ manuallyAdded: true, createdFromGatewaySync: false })).toBe(
        false,
      );
      expect(isGatewaySyncProvisioned(undefined)).toBe(false);
    });
  });

  describe('isManuallyAddedDevice', () => {
    it('detects manuallyAdded', () => {
      expect(isManuallyAddedDevice({ manuallyAdded: true, createdFromGatewaySync: false })).toBe(
        true,
      );
      expect(isManuallyAddedDevice({ manuallyAdded: false, createdFromGatewaySync: true })).toBe(
        false,
      );
    });
  });
});
