import {
  formatMetadataSideEffectsToast,
  mapDeviceApiErrorToFields,
} from '@/utils/deviceApiErrors';

describe('deviceApiErrors', () => {
  it('maps serial conflict to device_serial field', () => {
    expect(
      mapDeviceApiErrorToFields('Device serial "ABC" is already in use')
    ).toEqual({
      device_serial: 'Device serial "ABC" is already in use',
    });
  });

  it('formats side effects toast when access codes pushed', () => {
    const toast = formatMetadataSideEffectsToast({
      identityChanged: true,
      accessCodesPushed: true,
    });
    expect(toast.title).toBe('Device metadata updated');
    expect(toast.message).toMatch(/identity/i);
    expect(toast.message).toMatch(/access codes/i);
  });
});
