import {
  buildFacilityAccessGroupsPath,
  FACILITY_ACCESS_GROUP_ID_PARAM,
  readFacilityAccessGroupId,
} from '@/components/AccessCodes/access-groups.utils';

describe('access-groups navigation utils', () => {
  it('builds facility access groups path with optional group id', () => {
    expect(buildFacilityAccessGroupsPath('facility-1')).toBe('/facilities/facility-1?tab=device-groups');
    expect(buildFacilityAccessGroupsPath('facility-1', 'group-2')).toBe(
      `/facilities/facility-1?tab=device-groups&${FACILITY_ACCESS_GROUP_ID_PARAM}=group-2`,
    );
  });

  it('reads group id from search params', () => {
    expect(readFacilityAccessGroupId(`?tab=device-groups&${FACILITY_ACCESS_GROUP_ID_PARAM}=group-2`)).toBe('group-2');
    expect(readFacilityAccessGroupId('?tab=device-groups')).toBeNull();
  });
});
