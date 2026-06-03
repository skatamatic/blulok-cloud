import { deriveActionRequired, filterNotificationsForViewer, mapApiNotificationToDashboardView } from '@/utils/notification-display.utils';
import type { UserNotificationApi } from '@/types/notifications.types';

const api = (o: Partial<UserNotificationApi>): UserNotificationApi => ({
  id: '1',
  type: 'general',
  title: 't',
  message: 'm',
  priority: 'normal',
  isRead: false,
  readAt: null,
  reference: null,
  facilityId: null,
  metadata: null,
  createdAt: new Date().toISOString(),
  ...o,
});

describe('notification-display.utils', () => {
  it('deriveActionRequired from priority', () => {
    expect(deriveActionRequired('general', 'urgent')).toBe(true);
    expect(deriveActionRequired('general', 'normal')).toBe(false);
  });

  it('deriveActionRequired from notification type', () => {
    expect(deriveActionRequired('security_alert', 'low')).toBe(true);
    expect(deriveActionRequired('maintenance_alert', 'normal')).toBe(true);
  });

  it('mapApiNotificationToDashboardView sets displayType', () => {
    const v = mapApiNotificationToDashboardView(
      api({ type: 'security_alert', priority: 'urgent', title: 'X', message: 'Y' })
    );
    expect(v.actionRequired).toBe(true);
    expect(v.displayType).toBe('error');
    expect(v.notificationType).toBe('security_alert');
  });

  it('filterNotificationsForViewer hides backend_error from non-dev admins', () => {
    const rows = [
      api({ id: 'a', type: 'general' }),
      api({ id: 'b', type: 'backend_error' }),
    ];
    expect(filterNotificationsForViewer(rows, 'admin')).toHaveLength(1);
    expect(filterNotificationsForViewer(rows, 'dev_admin')).toHaveLength(2);
  });
});
