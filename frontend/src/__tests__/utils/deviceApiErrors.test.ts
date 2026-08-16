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

  it('maps relay, unit, gateway, and fallback submit fields', () => {
    expect(mapDeviceApiErrorToFields('Relay channel 3 is invalid')).toEqual({
      relay_channel: 'Relay channel 3 is invalid',
    });
    expect(mapDeviceApiErrorToFields('Unit already belongs to another device')).toEqual({
      unit_id: 'Unit already belongs to another device',
    });
    expect(mapDeviceApiErrorToFields('Gateway is offline')).toEqual({
      gateway_id: 'Gateway is offline',
    });
    expect(mapDeviceApiErrorToFields('Something else failed')).toEqual({
      submit: 'Something else failed',
    });
  });

  it('formats side effects toast variants', () => {
    expect(formatMetadataSideEffectsToast(null)).toEqual({
      title: 'Device metadata updated',
    });
    expect(formatMetadataSideEffectsToast({})).toEqual({
      title: 'Device metadata updated',
    });
    expect(
      formatMetadataSideEffectsToast({ identityChanged: true }),
    ).toEqual({
      title: 'Device metadata updated',
      message: 'Hardware identity was updated.',
    });
    expect(
      formatMetadataSideEffectsToast({ accessCodesPushed: true }),
    ).toEqual({
      title: 'Device metadata updated',
      message: 'Access codes were pushed to the gateway.',
    });

    const toast = formatMetadataSideEffectsToast({
      identityChanged: true,
      accessCodesPushed: true,
    });
    expect(toast.title).toBe('Device metadata updated');
    expect(toast.message).toMatch(/identity/i);
    expect(toast.message).toMatch(/access codes/i);
  });
});
