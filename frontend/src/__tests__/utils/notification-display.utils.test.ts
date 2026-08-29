import { formatNotificationTimestamp } from '@/utils/datetime.utils';
import {
  deriveActionRequired,
  filterNotificationsForViewer,
  getNotificationCardVisual,
  getNotificationDetailLines,
  getNotificationStructuredDetails,
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

  it('maps fms_webhook_received to info tone when informational', () => {
    const v = mapApiNotificationToDashboardView(
      api({
        type: 'fms_webhook_received',
        priority: 'low',
        title: 'FMS Webhook Received',
        message: '621 Sandbox received a unit created update. Changes were applied automatically.',
      }),
    );
    expect(v.title).toBe('FMS Update Push');
    expect(v.tone).toBe('info');
    expect(v.actionRequired).toBe(false);
  });

  it('treats blocked FMS sync complete cards as action-required warnings', () => {
    const v = mapApiNotificationToDashboardView(
      api({
        type: 'fms_sync_complete',
        priority: 'high',
        title: 'FMS Changes Need Review',
        message: 'Automatic sync did not apply because a problem was detected.',
        metadata: {
          requiresReview: true,
          autoApplyBlocked: true,
          syncLogId: 'sync-1',
          pendingCount: 1,
          statusLabel: 'Automatic sync did not apply',
          problemSummaries: [
            'Contact info matches BluLok user t3@blulok.com, who is already mapped to a different FMS tenant.',
          ],
        },
      }),
    );
    expect(v.tone).toBe('warning');
    expect(v.actionRequired).toBe(true);
    expect(v.displayType).toBe('warning');

    const rows = getNotificationStructuredDetails(v);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Status', value: 'Automatic sync did not apply' }),
        expect.objectContaining({ label: 'Problem', value: expect.stringContaining('t3@blulok.com') }),
        expect.objectContaining({ label: 'Next step', value: expect.stringContaining('Review changes') }),
      ]),
    );
  });

  it('marks pending-review FMS update pushes as action required via high priority', () => {
    const v = mapApiNotificationToDashboardView(
      api({
        type: 'fms_webhook_received',
        priority: 'high',
        title: 'FMS Webhook Received',
        message: '621 Sandbox received a unit created update. 1 change needs your review.',
      }),
    );
    expect(v.title).toBe('FMS Update Push');
    expect(v.actionRequired).toBe(true);
    expect(v.tone).toBe('warning');
  });

  it('formats FMS update push details without technical ids', () => {
    const view = mapApiNotificationToDashboardView(
      api({
        type: 'fms_webhook_received',
        message:
          'Kyle Test Facility received a unit created update. 1 change needs your review. (Unit unit-demo-001)',
        metadata: {
          facilityName: 'Kyle Test Facility',
          eventType: 'unit.created',
          eventLabel: 'Unit created',
          subjectLabel: 'Unit unit-demo-001',
          statusLabel: 'Needs your review',
          changesDetected: 1,
          changesApplied: 0,
          requiresReview: true,
        },
      }),
    );
    const lines = getNotificationDetailLines(view);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Kyle Test Facility');

    const rows = getNotificationStructuredDetails(view);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Update type', value: 'Unit created' }),
        expect.objectContaining({ label: 'Subject', value: 'Unit unit-demo-001' }),
        expect.objectContaining({ label: 'Status', value: 'Needs your review' }),
      ]),
    );
    expect(JSON.stringify(rows)).not.toContain('syncLogId');
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
