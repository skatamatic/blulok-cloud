import { UserRole } from '@/types/auth.types';
import { DashboardAssignmentListItem } from '@/hooks/useDashboardAssignments';

export type ScopeKind = 'global' | 'all_facilities' | 'facility' | 'user';
export type AssignmentFilter = 'all' | ScopeKind;

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.TENANT]: 'Tenant',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.FACILITY_ADMIN]: 'Facility admin',
  [UserRole.MAINTENANCE]: 'Maintenance',
  [UserRole.BLULOK_TECHNICIAN]: 'Technician',
  [UserRole.DEV_ADMIN]: 'Dev admin',
};

export const SCOPE_FILTER_OPTIONS: Array<{ id: AssignmentFilter; label: string }> = [
  { id: 'all', label: 'All scopes' },
  { id: 'global', label: 'Global' },
  { id: 'all_facilities', label: 'All facilities' },
  { id: 'facility', label: 'By facility' },
  { id: 'user', label: 'By user' },
];

export function assignmentScopeKind(row: DashboardAssignmentListItem): ScopeKind {
  if (row.scope === 'global') return 'global';
  if (row.scope === 'user') return 'user';
  if (row.scope === 'facility' && !row.facilityId) return 'all_facilities';
  return 'facility';
}

export function scopeLabel(row: DashboardAssignmentListItem): string {
  const kind = assignmentScopeKind(row);
  if (kind === 'global') return 'Global';
  if (kind === 'all_facilities') return 'All facilities';
  if (kind === 'facility') return 'Facility';
  return 'User';
}

export function targetLabel(row: DashboardAssignmentListItem): string {
  const kind = assignmentScopeKind(row);
  if (kind === 'global' || kind === 'all_facilities') return 'Everyone in scope';
  if (kind === 'facility') return row.facilityName ?? row.facilityId ?? '—';
  return row.userName || row.userEmail || row.userId || '—';
}

export function scopeBadgeClass(kind: ScopeKind): string {
  switch (kind) {
    case 'global':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200';
    case 'all_facilities':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200';
    case 'facility':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
    case 'user':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  }
}
