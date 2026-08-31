import { UserRole } from '@/types/auth.types';
import {
  applyUserScheduleAssignment,
  buildUserUnitMap,
  filterScheduleUsers,
  mergeFacilityScheduleUsers,
} from '@/components/Schedules/user-schedules.utils';

describe('user-schedules utils', () => {
  it('maps primary and shared tenants onto unit numbers', () => {
    const map = buildUserUnitMap([
      {
        unit_number: '100',
        primary_tenant: { id: 'p1' },
        shared_tenants: [{ id: 's1' }],
      },
    ]);
    expect(map.get('p1')).toEqual(['100']);
    expect(map.get('s1')).toEqual(['100']);
  });

  it('merges unit occupants missing from the paginated user list', () => {
    const merged = mergeFacilityScheduleUsers(
      [{ id: 'p1', email: 'p@x.com', firstName: 'Pat', lastName: 'Primary', role: UserRole.TENANT }],
      [
        {
          unit_number: '100',
          primary_tenant: { id: 'p1' },
          shared_tenants: [
            { id: 's1', email: 's@x.com', first_name: 'Sam', last_name: 'Share', role: UserRole.TENANT },
          ],
        },
      ],
    );
    expect(merged.map((u) => u.id).sort()).toEqual(['p1', 's1']);
  });

  it('filters by role and search without dropping unmatched fields', () => {
    const users = [
      {
        id: '1',
        email: 'a@x.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: UserRole.TENANT,
        unitNumbers: ['12'],
      },
      {
        id: '2',
        email: 'm@x.com',
        firstName: 'Mo',
        lastName: 'Tech',
        role: UserRole.MAINTENANCE,
        unitNumbers: [],
      },
    ];
    expect(filterScheduleUsers(users, '', 'tenant')).toHaveLength(1);
    expect(filterScheduleUsers(users, '12', 'all').map((u) => u.id)).toEqual(['1']);
  });

  it('applies a schedule assignment without touching other rows', () => {
    const next = applyUserScheduleAssignment(
      [
        { id: '1', email: 'a@x.com', firstName: 'Ada', lastName: 'L', role: UserRole.TENANT, currentSchedule: null },
        { id: '2', email: 'b@x.com', firstName: 'Bo', lastName: 'L', role: UserRole.TENANT, currentSchedule: null },
      ],
      '1',
      { id: 'sched-1', name: 'Nights', facility_id: 'f', schedule_type: 'custom', is_active: true, time_windows: [] },
    );
    expect(next[0].currentSchedule?.name).toBe('Nights');
    expect(next[1].currentSchedule).toBeNull();
  });
});
