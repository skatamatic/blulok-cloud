import { formatNotificationTimestamp } from '@/utils/datetime.utils';
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
    expect(v.tone).toBe('error');
  });

  it('filterNotificationsForViewer hides backend_error from non-dev admins', () => {
    const rows = [
      mapApiNotificationToDashboardView(api({ type: 'backend_error' })),
      mapApiNotificationToDashboardView(api({ type: 'general' })),
    ];
    const filtered = filterNotificationsForViewer(rows, 'facility_admin');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].notificationType).toBe('general');
  });

  it('getNotificationCardVisual uses urgent styling for unread critical notifications', () => {
    const view = mapApiNotificationToDashboardView(
      api({ type: 'security_alert', priority: 'urgent', isRead: false }),
    );
    const visual = getNotificationCardVisual(view);
    expect(visual.showPulse).toBe(true);
    expect(visual.card).toContain('border-red');
    expect(getNotificationUrgencyBadge(view)?.label).toBe('Critical');
  });

  it('getNotificationCardVisual keeps severity cues on read notifications', () => {
    const view = mapApiNotificationToDashboardView(
      api({ type: 'security_alert', priority: 'urgent', isRead: true }),
    );
    const visual = getNotificationCardVisual(view);
    expect(visual.showPulse).toBe(false);
    expect(visual.card).toContain('bg-white');
    expect(visual.card).toContain('border-red');
    expect(visual.accentBar).toContain('red');
    expect(getNotificationUrgencyBadge(view)?.label).toBe('Critical');
  });

  it('getNotificationCardVisual uses success styling for gateway restored', () => {
    const view = mapApiNotificationToDashboardView(
      api({ type: 'gateway_restored', priority: 'normal', isRead: false }),
    );
    const visual = getNotificationCardVisual(view);
    expect(visual.card).toContain('emerald');
    expect(getNotificationUrgencyBadge(view)).toBeNull();
  });

  describe('formatNotificationTimestamp', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-16T15:00:00'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows relative time for recent notifications', () => {
      const fiveMinutesAgo = new Date('2026-06-16T14:55:00');
      expect(formatNotificationTimestamp(fiveMinutesAgo)).toBe('5m ago');
      expect(formatNotificationTimestamp(fiveMinutesAgo, true)).toBe('5m');
    });

    it('shows date and time for notifications older than 24 hours', () => {
      const twoDaysAgo = new Date('2026-06-14T09:30:00');
      const formatted = formatNotificationTimestamp(twoDaysAgo);
      expect(formatted).toMatch(/Jun 14, 2026/);
      expect(formatted).toMatch(/9:30/);
    });
  });
});
