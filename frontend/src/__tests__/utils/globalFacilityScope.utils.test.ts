import { getScopedFacilityId } from '@/utils/globalFacilityScope.utils';
import { ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';

describe('getScopedFacilityId', () => {
  it('returns undefined for null, all-facilities sentinel, or empty', () => {
    expect(getScopedFacilityId(null)).toBeUndefined();
    expect(getScopedFacilityId(ALL_FACILITIES_ID)).toBeUndefined();
  });

  it('returns the facility id when a single facility is selected', () => {
    expect(getScopedFacilityId('fac-abc')).toBe('fac-abc');
  });
});
