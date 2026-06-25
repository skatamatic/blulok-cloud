import { formatRoleName, getRoleBadgeColor } from '@/utils/user-role-display.utils';
import { UserRole } from '@/types/auth.types';

describe('user-role-display.utils', () => {
  it('formats known roles', () => {
    expect(formatRoleName(UserRole.FACILITY_ADMIN)).toBe('Facility Admin');
    expect(formatRoleName(UserRole.TENANT)).toBe('Tenant');
  });

  it('returns badge classes for roles', () => {
    expect(getRoleBadgeColor(UserRole.ADMIN)).toContain('red');
    expect(getRoleBadgeColor(UserRole.TENANT)).toContain('gray');
  });
});
