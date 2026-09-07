import { resolveUnitsListFacilityId, normalizeUnitsListQuery } from '@/utils/units-query.utils';

describe('units-query.utils', () => {
  it('prefers facility_id over facilityId when both are present', () => {
    expect(resolveUnitsListFacilityId({
      facility_id: 'fac-a',
      facilityId: 'fac-b',
    })).toBe('fac-a');
  });

  it('accepts camelCase facilityId', () => {
    expect(resolveUnitsListFacilityId({ facilityId: 'fac-b' })).toBe('fac-b');
  });

  it('ignores blank facility identifiers', () => {
    expect(resolveUnitsListFacilityId({ facility_id: '  ', facilityId: '' })).toBeUndefined();
  });

  it('normalizes sort aliases and forced facility id', () => {
    expect(normalizeUnitsListQuery({
      facilityId: 'fac-b',
      sort_by: 'unit_number',
      sort_order: 'desc',
      limit: '25',
    }, 'fac-forced')).toMatchObject({
      facility_id: 'fac-forced',
      sortBy: 'unit_number',
      sortOrder: 'desc',
      limit: '25',
    });
  });
});
