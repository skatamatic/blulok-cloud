import { User, UserRole } from '@/types/auth.types';
import { ScheduleWithTimeWindows } from '@/types/schedule.types';

export const SCHEDULE_USER_ROLES = new Set<string>([UserRole.TENANT, UserRole.MAINTENANCE]);
export const USER_PAGE_SIZE = 200;
export const UNIT_PAGE_SIZE = 200;

export type ScheduleRoleFilter = 'all' | 'tenant' | 'maintenance';

export interface UserWithSchedule extends User {
  currentSchedule?: ScheduleWithTimeWindows | null;
  unitNumbers?: string[];
}

type TenantLike = {
  id?: string;
  email?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  role?: UserRole | string;
};

type UnitLike = {
  unit_number?: string;
  unitNumber?: string;
  primary_tenant?: TenantLike | null;
  shared_tenants?: TenantLike[] | null;
};

export function tenantDisplayName(user: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return name || user.email || '—';
}

export function tenantFromUnitOccupant(raw: TenantLike | null | undefined): User | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    email: raw.email ?? '',
    firstName: raw.firstName ?? raw.first_name ?? '',
    lastName: raw.lastName ?? raw.last_name ?? '',
    role: (raw.role as UserRole) || UserRole.TENANT,
  };
}

export function buildUserUnitMap(units: UnitLike[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (userId: string | undefined, unitNumber: string | undefined) => {
    if (!userId || !unitNumber) return;
    const list = map.get(userId) ?? [];
    if (!list.includes(unitNumber)) list.push(unitNumber);
    map.set(userId, list);
  };

  for (const unit of units) {
    const number = unit.unit_number ?? unit.unitNumber;
    add(unit.primary_tenant?.id, number);
    for (const shared of unit.shared_tenants ?? []) {
      add(shared.id, number);
    }
  }
  return map;
}

export function mergeFacilityScheduleUsers(
  listedUsers: User[],
  units: UnitLike[],
): User[] {
  const byId = new Map<string, User>();
  for (const user of listedUsers) {
    if (SCHEDULE_USER_ROLES.has(user.role)) byId.set(user.id, user);
  }
  for (const unit of units) {
    const occupants = [unit.primary_tenant, ...(unit.shared_tenants ?? [])];
    for (const occupant of occupants) {
      const user = tenantFromUnitOccupant(occupant);
      if (!user || !SCHEDULE_USER_ROLES.has(user.role) || byId.has(user.id)) continue;
      byId.set(user.id, user);
    }
  }
  return [...byId.values()];
}

export function defaultScheduleForUser(
  user: Pick<User, 'role'>,
  schedules: ScheduleWithTimeWindows[],
): ScheduleWithTimeWindows | undefined {
  if (user.role === UserRole.TENANT) {
    return schedules.find((s) => s.name === 'Default Tenant Schedule' && s.schedule_type === 'precanned');
  }
  if (user.role === UserRole.MAINTENANCE) {
    return schedules.find((s) => s.name === 'Maintenance Schedule' && s.schedule_type === 'precanned');
  }
  return undefined;
}

export function filterScheduleUsers(
  users: UserWithSchedule[],
  searchQuery: string,
  roleFilter: ScheduleRoleFilter,
): UserWithSchedule[] {
  let filtered = users;
  if (roleFilter !== 'all') {
    filtered = filtered.filter((user) => user.role === roleFilter);
  }
  const query = searchQuery.trim().toLowerCase();
  if (!query) return filtered;
  return filtered.filter((user) => {
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
    const email = user.email?.toLowerCase() || '';
    const unitNumbers = (user.unitNumbers || []).join(' ').toLowerCase();
    return fullName.includes(query) || email.includes(query) || unitNumbers.includes(query);
  });
}

export function sortScheduleUsers(
  users: UserWithSchedule[],
  sortBy: 'name' | 'role' | 'units' | 'schedule',
  sortOrder: 'asc' | 'desc',
): UserWithSchedule[] {
  const dir = sortOrder === 'desc' ? -1 : 1;
  return [...users].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') {
      cmp = tenantDisplayName(a).localeCompare(tenantDisplayName(b));
    } else if (sortBy === 'role') {
      cmp = String(a.role).localeCompare(String(b.role));
    } else if (sortBy === 'units') {
      cmp = (a.unitNumbers?.[0] ?? '').localeCompare(b.unitNumbers?.[0] ?? '', undefined, { numeric: true });
    } else {
      const aName = a.currentSchedule?.name ?? '';
      const bName = b.currentSchedule?.name ?? '';
      cmp = aName.localeCompare(bName);
    }
    return cmp * dir;
  });
}
