import {
  buildFacilityAccessGroupsPath,
  buildGroupableUnitSearchKeywords,
  FACILITY_ACCESS_GROUP_ID_PARAM,
  filterBlulokMembersByLockAssignment,
  filterGroupableUnitsByLockAssignment,
  groupableUnitHasAssignedLock,
  readFacilityAccessGroupId,
  resolveAccessGroupMemberSubtitle,
  resolveAccessGroupMemberTitle,
  resolveGroupMemberKey,
  resolveGroupableUnitLabel,
  unitMemberHasAssignedLock,
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

describe('access-groups unit-centric display utils', () => {
  it('uses unit number as the primary blulok member title', () => {
    expect(
      resolveAccessGroupMemberTitle(
        { device_id: 'lock-1', device_type: 'blulok', source_unit_id: 'unit-101' },
        { device_settings: { displayName: 'North wing' }, unit_number: '101' },
        { id: 'unit-101', unit_number: '101' },
      ),
    ).toBe('Unit 101');
  });

  it('shows no lock assigned subtitle when unit has no bound device', () => {
    expect(
      resolveAccessGroupMemberSubtitle(
        { device_id: 'unit-101', device_type: 'blulok', source_unit_id: 'unit-101' },
        undefined,
        { id: 'unit-101', unit_number: '101' },
      ),
    ).toBe('No lock assigned');
  });

  it('shows lock serial in subtitle when unit has a device', () => {
    expect(
      resolveAccessGroupMemberSubtitle(
        { device_id: 'lock-1', device_type: 'blulok', source_unit_id: 'unit-101' },
        { device_category: 'blulok', device_serial: 'BLU-101', unit_id: 'unit-101' },
        { id: 'unit-101', unit_number: '101', blulok_device: { id: 'lock-1', device_serial: 'BLU-101' } },
      ),
    ).toBe('Lock assigned · BLU-101');
  });

  it('resolves stable member keys by unit id for unit-linked rows', () => {
    expect(
      resolveGroupMemberKey({
        device_id: 'lock-1',
        device_type: 'blulok',
        source_unit_id: 'unit-101',
      }),
    ).toBe('unit:unit-101');
  });

  it('detects assigned locks from facility device inventory', () => {
    const member = { device_id: 'unit-101', device_type: 'blulok' as const, source_unit_id: 'unit-101' };
    expect(
      unitMemberHasAssignedLock(member, [], { id: 'unit-101', unit_number: '101' }),
    ).toBe(false);
    expect(
      unitMemberHasAssignedLock(
        member,
        [{ id: 'lock-1', device_category: 'blulok', unit_id: 'unit-101' }],
        { id: 'unit-101', unit_number: '101' },
      ),
    ).toBe(true);
  });

  it('labels and searches groupable units', () => {
    expect(resolveGroupableUnitLabel({ id: 'unit-1', unit_number: '2453' })).toBe('Unit 2453');
    const keywords = buildGroupableUnitSearchKeywords({
      id: 'unit-1',
      unit_number: '2453',
      status: 'available',
    });
    expect(keywords).toEqual(expect.arrayContaining(['2453', 'Unit 2453', 'available', 'no lock']));
  });

  it('filters groupable units and members by lock assignment', () => {
    const units = [
      { id: 'unit-1', unit_number: '101', blulok_device: { id: 'lock-1', device_serial: 'BLU-1' } },
      { id: 'unit-2', unit_number: '202' },
    ];
    const devices = [{ id: 'lock-1', device_category: 'blulok' as const, unit_id: 'unit-1' }];
    expect(filterGroupableUnitsByLockAssignment(units, false, devices)).toEqual([units[0]]);
    expect(filterGroupableUnitsByLockAssignment(units, true, devices)).toEqual(units);
    expect(groupableUnitHasAssignedLock(units[1], devices)).toBe(false);

    const members = [
      { device_id: 'lock-1', device_type: 'blulok' as const, source_unit_id: 'unit-1' },
      { device_id: 'unit-2', device_type: 'blulok' as const, source_unit_id: 'unit-2' },
      { device_id: 'ac-1', device_type: 'access_control' as const },
    ];
    expect(filterBlulokMembersByLockAssignment(members, false, units, devices)).toEqual([
      members[0],
      members[2],
    ]);
  });
});
