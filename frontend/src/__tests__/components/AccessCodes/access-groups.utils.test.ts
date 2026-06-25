import {
  buildFacilityAccessGroupsPath,
  buildGroupableBlulokSearchKeywords,
  FACILITY_ACCESS_GROUP_ID_PARAM,
  readFacilityAccessGroupId,
  resolveAccessGroupMemberTitle,
  resolveGroupableDeviceLabel,
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

describe('access-groups device display utils', () => {
  it('resolves blulok member title from device settings like device details', () => {
    expect(
      resolveAccessGroupMemberTitle(
        { device_id: 'lock-1', device_type: 'blulok' },
        { device_settings: { displayName: 'North wing' } },
      ),
    ).toBe('North wing');

    expect(
      resolveAccessGroupMemberTitle(
        { device_id: 'lock-1', device_type: 'blulok' },
        { device_settings: { lockNumber: 2453 } },
      ),
    ).toBe('Lock #2453');
  });

  it('shows unknown lock when blulok member device is missing', () => {
    expect(
      resolveAccessGroupMemberTitle(
        { device_id: '550e8400-e29b-41d4-a716-446655440011', device_type: 'blulok' },
        undefined,
      ),
    ).toBe('Unknown lock');
  });

  it('builds blulok search keywords from display metadata', () => {
    const keywords = buildGroupableBlulokSearchKeywords({
      id: 'lock-1',
      device_settings: { lockNumber: 2453, displayName: 'Front lock' },
      unit_number: '101',
    });
    expect(keywords).toEqual(expect.arrayContaining(['2453', 'Lock #2453', 'Front lock', '101']));
  });

  it('labels groupable blulok devices with page title helper', () => {
    expect(
      resolveGroupableDeviceLabel({
        id: 'lock-1',
        device_category: 'blulok',
        device_settings: { lockNumber: 12 },
      }),
    ).toBe('Lock #12');
  });
});
