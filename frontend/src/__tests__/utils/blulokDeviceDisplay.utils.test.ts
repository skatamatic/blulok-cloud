import {
  formatBluLokDeviceSubtitle,
  formatBluLokDevicePageTitle,
  formatBluLokUnassignedLabel,
  formatBluLokUserFacingLabel,
  getBluLokHardwareSerial,
  getBluLokLockNumber,
  getBluLokSerialIdentityPrefix,
  BLULOK_UNASSIGNED_LABEL_PREFIX,
} from '@/utils/blulokDeviceDisplay.utils';

describe('blulokDeviceDisplay.utils', () => {
  const uuid = '3969d612-abcd-4ef0-b123-456789abcdef';

  it('matches the shared FE/BE BluLok label contract', () => {
    // Mirror of backend/src/utils/blulok-device-display.utils.ts — keep both sides aligned.
    expect(BLULOK_UNASSIGNED_LABEL_PREFIX).toBe('Unassigned - ');
    expect(getBluLokSerialIdentityPrefix('SN12345678')).toBe('12345');
    expect(getBluLokSerialIdentityPrefix(uuid)).toBe('39696');
    expect(formatBluLokUserFacingLabel({ unit_number: 'A-1', device_serial: 'SN9' })).toBe('A-1');
    expect(formatBluLokUserFacingLabel({ device_serial: 'SN12345678' })).toBe('Unassigned - 12345');
  });

  describe('formatBluLokUserFacingLabel', () => {
    it('uses unit number when assigned', () => {
      expect(
        formatBluLokUserFacingLabel({
          unit_number: 'A-101',
          device_serial: uuid,
          device_settings: { lockNumber: 2453 },
        }),
      ).toBe('A-101');
    });

    it('uses Unassigned - first 5 serial digits when vacant', () => {
      expect(
        formatBluLokUserFacingLabel({
          device_serial: 'SN12345678',
          device_settings: { lockNumber: 2453 },
        }),
      ).toBe('Unassigned - 12345');
      expect(formatBluLokUnassignedLabel('SN12345678')).toBe('Unassigned - 12345');
    });

    it('never shows Lock # even when lock number is present', () => {
      expect(
        formatBluLokUserFacingLabel({
          device_serial: uuid,
          device_settings: { lockNumber: 2453 },
        }),
      ).toBe(`Unassigned - ${getBluLokSerialIdentityPrefix(uuid)}`);
    });
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

  describe('formatBluLokDevicePageTitle', () => {
    it('prefers display name from device settings', () => {
      expect(
        formatBluLokDevicePageTitle({
          device_serial: 'BLU-002',
          device_settings: { displayName: 'Front gate' },
        }),
      ).toBe('Front gate');
    });

    it('uses unit number when no display name or name', () => {
      expect(
        formatBluLokDevicePageTitle({
          unit_number: 'B-12',
          device_serial: 'BLU-002',
          device_settings: { lockNumber: 12 },
        }),
      ).toBe('B-12');
    });

    it('falls back to Unassigned identity when no unit', () => {
      expect(
        formatBluLokDevicePageTitle({ device_serial: 'BLU-002', serial: 'BLU-002' }),
      ).toBe('Unassigned - 002');
    });
  });

  it('extracts lock number from device_settings for admin metadata only', () => {
    expect(getBluLokLockNumber({ device_settings: { lock_number: 101 } })).toBe(101);
  });

  it('skips uuid when resolving hardware serial', () => {
    expect(getBluLokHardwareSerial({ device_serial: uuid, serial: 'HW-99' })).toBe('HW-99');
  });
});
