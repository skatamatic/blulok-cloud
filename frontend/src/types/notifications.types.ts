/**
 * In-app notification row returned by GET /api/v1/notifications
 * (matches backend NotificationResponse)
 */
export interface UserNotificationApi {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  isRead: boolean;
  readAt: string | null;
  reference: { type: string; id: string } | null;
  facilityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
