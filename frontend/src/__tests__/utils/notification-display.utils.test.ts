import {
  deriveActionRequired,
  filterNotificationsForViewer,
  getNotificationCardVisual,
  getNotificationUrgencyBadge,
  mapApiNotificationToDashboardView,
} from '@/utils/notification-display.utils';
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

  it('getNotificationCardVisual uses urgent styling for unread critical notifications', () => {
    const view = mapApiNotificationToDashboardView(
      api({ type: 'gateway_offline', priority: 'urgent', isRead: false }),
    );
    const visual = getNotificationCardVisual(view);
    expect(visual.showPulse).toBe(true);
    expect(visual.card).toContain('red');
    expect(getNotificationUrgencyBadge(view)?.label).toBe('Critical');
  });

  it('getNotificationCardVisual mutes read notifications', () => {
    const view = mapApiNotificationToDashboardView(
      api({ type: 'gateway_offline', priority: 'urgent', isRead: true }),
    );
    const visual = getNotificationCardVisual(view);
    expect(visual.showPulse).toBe(false);
    expect(visual.card).toContain('bg-white');
    expect(getNotificationUrgencyBadge(view)).toBeNull();
  });

  it('getNotificationCardVisual uses success styling for gateway restored', () => {
    const view = mapApiNotificationToDashboardView(
      api({ type: 'gateway_restored', priority: 'normal', isRead: false }),
    );
    const visual = getNotificationCardVisual(view);
    expect(visual.card).toContain('emerald');
    expect(getNotificationUrgencyBadge(view)).toBeNull();
  });
});
