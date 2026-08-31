import {
  DEV_ADMIN_ONLY_NOTIFICATION_TYPES,
  InAppNotificationType,
} from '@/constants/in-app-notification.constants';
import { UserRole } from '@/types/auth.types';

export function excludedNotificationTypesForRole(role: UserRole): InAppNotificationType[] {
  return role === UserRole.DEV_ADMIN ? [] : [...DEV_ADMIN_ONLY_NOTIFICATION_TYPES];
}

export function canViewNotificationType(role: UserRole, notificationType: string): boolean {
  if (role === UserRole.DEV_ADMIN) {
    return true;
  }
  return !DEV_ADMIN_ONLY_NOTIFICATION_TYPES.includes(notificationType as InAppNotificationType);
}
