import {
  isFacilitySetupDetailRoute,
  resolveFacilitySetupPath,
} from '@/utils/facility-setup-navigation.utils';
import { ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';

describe('facility-setup-navigation.utils', () => {
  it('detects unit and device detail routes', () => {
    expect(isFacilitySetupDetailRoute('/units/u-1')).toBe(true);
    expect(isFacilitySetupDetailRoute('/devices/d-1')).toBe(true);
    expect(isFacilitySetupDetailRoute('/facilities/fac-1/edit')).toBe(true);
  });

  it('ignores list and facility overview routes', () => {
    expect(isFacilitySetupDetailRoute('/facilities/fac-1')).toBe(false);
    expect(isFacilitySetupDetailRoute('/facilities')).toBe(false);
    expect(isFacilitySetupDetailRoute('/units')).toBe(false);
    expect(isFacilitySetupDetailRoute('/dashboard')).toBe(false);
  });

  it('resolves facility setup path for a selected facility', () => {
    expect(resolveFacilitySetupPath('fac-2', false)).toBe('/facilities/fac-2');
  });

  it('resolves all-facilities hub when none is selected', () => {
    expect(resolveFacilitySetupPath(ALL_FACILITIES_ID, true)).toBe('/facilities');
    expect(resolveFacilitySetupPath(null, false)).toBe('/facilities');
  });
});
