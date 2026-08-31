import { formatRoleName, getRoleBadgeColor } from '@/utils/user-role-display.utils';
import { UserRole } from '@/types/auth.types';

describe('user-role-display.utils', () => {
  it('formats every known role', () => {
    expect(formatRoleName(UserRole.DEV_ADMIN)).toBe('Dev Admin');
    expect(formatRoleName(UserRole.ADMIN)).toBe('Admin');
    expect(formatRoleName(UserRole.FACILITY_ADMIN)).toBe('Facility Admin');
    expect(formatRoleName(UserRole.BLULOK_TECHNICIAN)).toBe('BluLok Technician');
    expect(formatRoleName(UserRole.MAINTENANCE)).toBe('Maintenance');
    expect(formatRoleName(UserRole.TENANT)).toBe('Tenant');
    expect(formatRoleName('unknown' as UserRole)).toBe('Tenant');
  });

  it('returns badge classes for every role', () => {
    expect(getRoleBadgeColor(UserRole.DEV_ADMIN)).toContain('purple');
    expect(getRoleBadgeColor(UserRole.ADMIN)).toContain('red');
    expect(getRoleBadgeColor(UserRole.FACILITY_ADMIN)).toContain('blue');
    expect(getRoleBadgeColor(UserRole.BLULOK_TECHNICIAN)).toContain('orange');
    expect(getRoleBadgeColor(UserRole.MAINTENANCE)).toContain('yellow');
    expect(getRoleBadgeColor(UserRole.TENANT)).toContain('gray');
    expect(getRoleBadgeColor('unknown' as UserRole)).toContain('gray');
  });
});
