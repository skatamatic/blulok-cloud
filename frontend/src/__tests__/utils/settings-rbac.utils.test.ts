import {
  canAccessSystemSettings,
  canEditDashboardLayout,
  canManageDashboardLibrary,
  canAccessDashboardSettings,
} from '@/utils/settings-rbac.utils';
import { UserRole } from '@/types/auth.types';

describe('settings-rbac.utils', () => {
  it('allows operational roles to access settings', () => {
    expect(canAccessSystemSettings(UserRole.TENANT)).toBe(true);
    expect(canAccessSystemSettings(UserRole.MAINTENANCE)).toBe(true);
    expect(canAccessSystemSettings(UserRole.FACILITY_ADMIN)).toBe(true);
    expect(canAccessSystemSettings(UserRole.ADMIN)).toBe(true);
  });

  it('restricts dashboard layout editing to admins', () => {
    expect(canEditDashboardLayout(UserRole.ADMIN)).toBe(true);
    expect(canEditDashboardLayout(UserRole.DEV_ADMIN)).toBe(true);
    expect(canEditDashboardLayout(UserRole.FACILITY_ADMIN)).toBe(false);
    expect(canEditDashboardLayout(UserRole.TENANT)).toBe(false);
  });

  it('restricts dashboard library management to admins', () => {
    expect(canManageDashboardLibrary(UserRole.ADMIN)).toBe(true);
    expect(canManageDashboardLibrary(UserRole.DEV_ADMIN)).toBe(true);
    expect(canManageDashboardLibrary(UserRole.FACILITY_ADMIN)).toBe(false);
    expect(canManageDashboardLibrary(UserRole.TENANT)).toBe(false);
  });

  it('shows dashboard settings tab when personal or library access applies', () => {
    expect(canAccessDashboardSettings(UserRole.ADMIN)).toBe(true);
    expect(canAccessDashboardSettings(UserRole.FACILITY_ADMIN)).toBe(false);
    expect(canAccessDashboardSettings(UserRole.TENANT)).toBe(false);
  });
});
