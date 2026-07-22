import {
  formatBluLokUnassignedLabel,
  formatBluLokUserFacingLabel,
  getBluLokSerialIdentityPrefix,
  isLikelyUuid,
  resolveBluLokDeviceDisplayName,
} from '@/utils/blulok-device-display.utils';

describe('blulok-device-display.utils', () => {
  it('matches the shared FE/BE BluLok label contract', () => {
    // Mirror of frontend/src/utils/blulokDeviceDisplay.utils.ts — keep both sides aligned.
    expect(formatBluLokUserFacingLabel({ unit_number: 'A-1', device_serial: 'SN9' })).toBe('A-1');
    expect(formatBluLokUserFacingLabel({ device_serial: 'SN12345678' })).toBe('Unassigned - 12345');
    expect(getBluLokSerialIdentityPrefix('3969d612-abcd-4ef0-b123-456789abcdef')).toBe('39696');
  });

  it('prefers displayName from device settings', () => {
    expect(resolveBluLokDeviceDisplayName({
      device_settings: { displayName: 'Unit 106 Lock' },
      device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
      unit_number: '106',
    })).toBe('Unit 106 Lock');
  });

  it('uses unit number instead of lock number', () => {
    expect(formatBluLokUserFacingLabel({
      device_settings: { lockNumber: 106 },
      device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
      unit_number: '106',
    })).toBe('106');
    expect(resolveBluLokDeviceDisplayName({
      device_settings: { lockNumber: 106 },
      device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
      unit_number: '106',
    })).toBe('106');
  });

  it('uses Unassigned - serial digits when no unit', () => {
    expect(formatBluLokUserFacingLabel({
      device_settings: { lockNumber: 106 },
      device_serial: 'SN987654',
    })).toBe('Unassigned - 98765');
    expect(formatBluLokUnassignedLabel('SN987654')).toBe('Unassigned - 98765');
  });

  it('uses Unassigned prefix from UUID serial digits when no hardware serial', () => {
    expect(resolveBluLokDeviceDisplayName({
      device_settings: null,
      device_serial: 'ae4097b2-16b3-4b1d-b964-6021c7be6ea2',
    })).toBe(`Unassigned - ${getBluLokSerialIdentityPrefix('ae4097b2-16b3-4b1d-b964-6021c7be6ea2')}`);
  });

  it('detects UUID-shaped serials', () => {
    expect(isLikelyUuid('ae4097b2-16b3-4b1d-b964-6021c7be6ea2')).toBe(true);
    expect(isLikelyUuid('GW-123')).toBe(false);
  });
});
