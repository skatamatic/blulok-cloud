import { isLikelyUuid, resolveBluLokDeviceDisplayName } from '@/utils/blulok-device-display.utils';

describe('blulok-device-display.utils', () => {
  it('prefers displayName from device settings', () => {
    expect(resolveBluLokDeviceDisplayName({
      device_settings: { displayName: 'Unit 106 Lock' },
      device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
    })).toBe('Unit 106 Lock');
  });

  it('falls back to lock number when serial is a lock id UUID', () => {
    expect(resolveBluLokDeviceDisplayName({
      device_settings: { lockNumber: 106 },
      device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
    })).toBe('Lock #106');
  });

  it('uses non-UUID hardware serial when no settings label exists', () => {
    expect(resolveBluLokDeviceDisplayName({
      device_settings: null,
      device_serial: 'GW-123',
    })).toBe('GW-123');
  });

  it('detects UUID-shaped serials', () => {
    expect(isLikelyUuid('ae4097b2-16b3-4b1d-b964-6021c7be6ea2')).toBe(true);
    expect(isLikelyUuid('GW-123')).toBe(false);
  });
});
