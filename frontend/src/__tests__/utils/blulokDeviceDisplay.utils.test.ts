import {
  formatBluLokDeviceSubtitle,
  formatBluLokLockNumberLabel,
  getBluLokHardwareSerial,
  getBluLokLockNumber,
} from '@/utils/blulokDeviceDisplay.utils';

describe('blulokDeviceDisplay.utils', () => {
  const uuid = '3969d612-abcd-4ef0-b123-456789abcdef';

  it('prefers lock number for primary label', () => {
    expect(
      formatBluLokLockNumberLabel({
        device_serial: uuid,
        device_settings: { lockNumber: 2453 },
        firmware_version: '2.10.0',
      }),
    ).toBe('Lock #2453');
  });

  it('builds subtitle with serial and firmware', () => {
    expect(
      formatBluLokDeviceSubtitle({
        device_serial: uuid,
        serial: 'SN-12345',
        device_settings: { lockNumber: 2453 },
        firmware_version: '2.10.0',
      }),
    ).toBe('Serial SN-12345 · FW 2.10.0');
  });

  it('falls back to non-uuid device_serial when no lock number', () => {
    expect(
      formatBluLokLockNumberLabel({ device_serial: 'BLU-002', firmware_version: '1.0.0' }),
    ).toBe('BLU-002');
  });

  it('extracts lock number from device_settings', () => {
    expect(getBluLokLockNumber({ device_settings: { lock_number: 101 } })).toBe(101);
  });

  it('skips uuid when resolving hardware serial', () => {
    expect(getBluLokHardwareSerial({ device_serial: uuid, serial: 'HW-99' })).toBe('HW-99');
  });
});
