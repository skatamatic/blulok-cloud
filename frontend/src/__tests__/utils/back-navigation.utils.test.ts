import { getBackButtonLabel, getDestinationLabel } from '@/utils/back-navigation.utils';

describe('back-navigation.utils', () => {
  it('labels list routes', () => {
    expect(getDestinationLabel('/devices')).toBe('Devices');
    expect(getDestinationLabel('/units?page=2')).toBe('Units');
    expect(getDestinationLabel('/users')).toBe('Users');
    expect(getDestinationLabel('/dashboard')).toBe('Dashboard');
  });

  it('labels detail routes', () => {
    expect(getDestinationLabel('/devices/device-1')).toBe('Device');
    expect(getDestinationLabel('/units/unit-1?tab=tenant')).toBe('Unit');
    expect(getDestinationLabel('/users/u1/details')).toBe('User');
    expect(getDestinationLabel('/facilities/f1?tab=units')).toBe('Facility');
    expect(getDestinationLabel('/facilities/f1/edit')).toBe('Facility');
  });

  it('maps /facilities hub to Facility Setup', () => {
    expect(getDestinationLabel('/facilities')).toBe('Facility Setup');
  });

  it('builds back button labels', () => {
    expect(getBackButtonLabel('/devices')).toBe('Back to Devices');
    expect(getBackButtonLabel('/devices/device-1')).toBe('Back to Device');
    expect(getBackButtonLabel('/unknown/path')).toBe('Back');
  });
});
