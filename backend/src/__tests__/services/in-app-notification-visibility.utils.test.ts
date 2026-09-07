import { UserRole } from '@/types/auth.types';
import {
  canViewNotificationType,
  excludedNotificationTypesForRole,
} from '@/utils/in-app-notification-visibility.utils';

describe('in-app-notification-visibility.utils', () => {
  it('excludes backend_error for non-dev admins', () => {
    expect(excludedNotificationTypesForRole(UserRole.ADMIN)).toEqual(['backend_error']);
    expect(excludedNotificationTypesForRole(UserRole.FACILITY_ADMIN)).toEqual(['backend_error']);
    expect(excludedNotificationTypesForRole(UserRole.DEV_ADMIN)).toEqual([]);
  });

  it('allows dev_admin to view backend_error', () => {
    expect(canViewNotificationType(UserRole.DEV_ADMIN, 'backend_error')).toBe(true);
    expect(canViewNotificationType(UserRole.ADMIN, 'backend_error')).toBe(false);
    expect(canViewNotificationType(UserRole.ADMIN, 'gateway_offline')).toBe(true);
  });
});
