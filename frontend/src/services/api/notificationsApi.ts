import { get, post, del } from './httpClient';
import type { UserNotificationApi } from '@/types/notifications.types';

export async function getNotifications(params?: {
  facilityId?: string;
  type?: string;
  priority?: string;
  isRead?: boolean;
  includeExpired?: boolean;
  includeHidden?: boolean;
  limit?: number;
  offset?: number;
}) {
  return get<{
    success: boolean;
    notifications: UserNotificationApi[];
    total: number;
    unreadCount: number;
    limit: number;
    offset: number;
  }>('/notifications', { params });
}

export async function getNotificationsUnreadCount(params?: { facilityId?: string }) {
  return get<{ success: boolean; unreadCount: number }>('/notifications/unread-count', { params });
}

export async function markNotificationRead(notificationId: string) {
  return post<{ success: boolean; notification: UserNotificationApi }>(`/notifications/${notificationId}/read`);
}

export async function markNotificationsRead(notificationIds: string[]) {
  return post<{ success: boolean; markedCount: number }>('/notifications/read', { notificationIds });
}

export async function markAllNotificationsRead(facilityId?: string) {
  return post<{ success: boolean; markedCount: number }>('/notifications/read-all', facilityId ? { facilityId } : {});
}

export async function hideAllNotifications(facilityId?: string) {
  return post<{ success: boolean; hiddenCount: number }>('/notifications/hide-all', facilityId ? { facilityId } : {});
}

export async function deleteNotification(notificationId: string) {
  return del<{ success: boolean; message?: string }>(`/notifications/${notificationId}`);
}
