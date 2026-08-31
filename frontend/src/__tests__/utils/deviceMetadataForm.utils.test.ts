import {
  buildBluLokDeviceSettings,
  readDisplayName,
  readLockNumber,
  readLocationDescription,
} from '@/utils/deviceMetadataForm.utils';

describe('deviceMetadataForm.utils', () => {
  it('reads lock number from camelCase or snake_case settings', () => {
    expect(readLockNumber({ lockNumber: 2453 })).toBe('2453');
    expect(readLockNumber({ lock_number: 101 })).toBe('101');
    expect(readLockNumber({})).toBe('');
  });

  it('reads display name and location from settings', () => {
    expect(readDisplayName({ displayName: 'Front lock' })).toBe('Front lock');
    expect(readLocationDescription({ locationDescription: 'Unit 101 door' })).toBe('Unit 101 door');
  });

  it('builds device_settings patch for lock number, display name, and location', () => {
    expect(
      buildBluLokDeviceSettings(
        { lockNumber: 1, displayName: 'Old', extra: true },
        { lockNumber: '2453', displayName: 'Front', locationDescription: 'North' },
      ),
    ).toEqual({
      lockNumber: 2453,
      displayName: 'Front',
      locationDescription: 'North',
      extra: true,
    });
  });

  it('clears lock number when patch is empty string', () => {
    expect(buildBluLokDeviceSettings({ lockNumber: 1, lock_number: 1 }, { lockNumber: '' })).toEqual({});
  });
});
