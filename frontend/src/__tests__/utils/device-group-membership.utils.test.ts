import {
  formatAccessGroupLabel,
  isBlulokMemberForUnit,
  isDeviceGroupMember,
  sortAccessGroupRefs,
} from '@/utils/device-group-membership.utils';

describe('device-group-membership.utils', () => {
  it('matches blulok members by source unit id', () => {
    expect(isBlulokMemberForUnit(
      { device_id: 'lock-1', device_type: 'blulok', source_unit_id: 'unit-1' },
      'unit-1',
      'lock-1',
    )).toBe(true);
  });

  it('matches blulok members by device id when unit link is absent', () => {
    expect(isBlulokMemberForUnit(
      { device_id: 'lock-1', device_type: 'blulok' },
      'unit-1',
      'lock-1',
    )).toBe(true);
  });

  it('resolves device membership for blulok via unit id', () => {
    expect(isDeviceGroupMember(
      { device_id: 'other-lock', device_type: 'blulok', source_unit_id: 'unit-9' },
      'lock-1',
      'unit-9',
      'blulok',
    )).toBe(true);
  });

  it('formats default group labels', () => {
    expect(formatAccessGroupLabel({ name: 'Default Facility Group', is_default: true }))
      .toBe('Default Facility Group (Default — all tenants)');
  });

  it('sorts default groups first', () => {
    expect(sortAccessGroupRefs([
      { id: 'b', name: 'Building A', is_default: false },
      { id: 'a', name: 'Default Facility Group', is_default: true },
    ])).toEqual([
      { id: 'a', name: 'Default Facility Group', is_default: true },
      { id: 'b', name: 'Building A', is_default: false },
    ]);
  });
});
