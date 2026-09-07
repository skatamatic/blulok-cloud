import {
  assignmentScopeKind,
  ROLE_LABELS,
  SCOPE_FILTER_OPTIONS,
  scopeBadgeClass,
  scopeLabel,
  targetLabel,
} from '@/components/Settings/dashboard-assignment.utils';
import type { DashboardAssignmentListItem } from '@/hooks/useDashboardAssignments';
import { UserRole } from '@/types/auth.types';

function row(
  overrides: Partial<DashboardAssignmentListItem> = {},
): DashboardAssignmentListItem {
  return {
    id: 'a1',
    savedDashboardId: 'd1',
    savedDashboardName: 'Ops',
    scope: 'facility',
    facilityId: 'fac-1',
    facilityName: 'Riverside',
    userId: null,
    userEmail: null,
    userName: null,
    targetRole: UserRole.FACILITY_ADMIN,
    priority: 0,
    createdBy: 'admin',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('dashboard-assignment.utils', () => {
  it('exposes role and filter option catalogs', () => {
    expect(ROLE_LABELS[UserRole.ADMIN]).toBe('Admin');
    expect(SCOPE_FILTER_OPTIONS.map((o) => o.id)).toContain('all_facilities');
  });

  it('classifies scope kinds', () => {
    expect(assignmentScopeKind(row({ scope: 'global', facilityId: null }))).toBe('global');
    expect(assignmentScopeKind(row({ scope: 'user', userId: 'u1' }))).toBe('user');
    expect(assignmentScopeKind(row({ scope: 'facility', facilityId: null }))).toBe(
      'all_facilities',
    );
    expect(assignmentScopeKind(row({ scope: 'facility', facilityId: 'fac-1' }))).toBe(
      'facility',
    );
  });

  it('labels scopes and targets', () => {
    expect(scopeLabel(row({ scope: 'global', facilityId: null }))).toBe('Global');
    expect(scopeLabel(row({ scope: 'facility', facilityId: null }))).toBe('All facilities');
    expect(scopeLabel(row())).toBe('Facility');
    expect(scopeLabel(row({ scope: 'user', userId: 'u1' }))).toBe('User');

    expect(targetLabel(row({ scope: 'global', facilityId: null }))).toBe(
      'Everyone in scope',
    );
    expect(targetLabel(row())).toBe('Riverside');
    expect(
      targetLabel(row({ facilityName: null, facilityId: 'fac-9' })),
    ).toBe('fac-9');
    expect(
      targetLabel(
        row({
          scope: 'user',
          userId: 'u1',
          userName: 'Ada',
          userEmail: 'a@b.com',
        }),
      ),
    ).toBe('Ada');
    expect(
      targetLabel(
        row({
          scope: 'user',
          userId: 'u1',
          userName: null,
          userEmail: 'a@b.com',
        }),
      ),
    ).toBe('a@b.com');
    expect(
      targetLabel(
        row({
          scope: 'user',
          userId: 'u1',
          userName: null,
          userEmail: null,
        }),
      ),
    ).toBe('u1');
  });

  it('returns badge classes for each scope kind', () => {
    expect(scopeBadgeClass('global')).toContain('violet');
    expect(scopeBadgeClass('all_facilities')).toContain('sky');
    expect(scopeBadgeClass('facility')).toContain('emerald');
    expect(scopeBadgeClass('user')).toContain('amber');
  });
});
