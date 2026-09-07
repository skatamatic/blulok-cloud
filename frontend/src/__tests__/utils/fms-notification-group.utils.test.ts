import type { DashboardNotificationView } from '@/utils/notification-display.utils';
import {
  formatGroupedFmsUpdateMessage,
  getFmsWebhookGroupKey,
  groupDashboardNotifications,
  rememberUnreadFmsNotificationGroups,
} from '@/utils/fms-notification-group.utils';

function note(
  overrides: Partial<DashboardNotificationView> &
    Pick<DashboardNotificationView, 'id' | 'message' | 'metadata'>,
): DashboardNotificationView {
  return {
    title: 'FMS Update Push',
    notificationType: 'fms_webhook_received',
    priority: 'high',
    tone: 'warning',
    timestamp: new Date('2026-08-28T12:00:00Z'),
    isRead: false,
    isHidden: false,
    actionRequired: true,
    source: 'system',
    facilityId: 'fac-hq',
    ...overrides,
  };
}

describe('groupDashboardNotifications', () => {
  it('clusters Tester Three webhook pushes into one card', () => {
    const rows = [
      note({
        id: 'lead-1',
        message: 'BluLok HQ received a lead move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
        metadata: {
          eventType: 'lead.moved-in',
          requiresReview: true,
          syncLogId: 'sync-a',
          subjectLabel: 'Tester Three · Unit 100',
          facilityName: 'BluLok HQ',
        },
      }),
      note({
        id: 'move-1',
        message: 'BluLok HQ received a tenant move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
        metadata: {
          eventType: 'ledger.moved-in',
          requiresReview: true,
          syncLogId: 'sync-b',
          subjectLabel: 'Tester Three · Unit 100',
          facilityName: 'BluLok HQ',
        },
      }),
      note({
        id: 'tenant-1',
        message: 'BluLok HQ received a new tenant update. 1 change needs your review before they take effect. (Tester Three (t3@blulok.com))',
        metadata: {
          eventType: 'tenant.created',
          requiresReview: true,
          syncLogId: 'sync-c',
          subjectLabel: 'Tester Three (t3@blulok.com)',
          facilityName: 'BluLok HQ',
        },
      }),
    ];

    expect(getFmsWebhookGroupKey(rows[0])).toBe(getFmsWebhookGroupKey(rows[2]));
    const grouped = groupDashboardNotifications(rows, new Set(['sync-a']));
    expect(grouped).toHaveLength(1);
    expect(grouped[0].instances).toHaveLength(3);
    expect(grouped[0].notification.message).toContain('3 FMS updates');
    expect(grouped[0].notification.message).toContain('Tester Three');
    expect(grouped[0].notification.message).toContain('still pending');
    expect(grouped[0].notification.actionRequired).toBe(true);
  });

  it('starts a new group when another notification sits between matching FMS pushes', () => {
    const first = note({
      id: 'lead-1',
      message: 'BluLok HQ received a lead move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
      metadata: {
        eventType: 'lead.moved-in',
        requiresReview: true,
        syncLogId: 'sync-a',
        subjectLabel: 'Tester Three · Unit 100',
        facilityName: 'BluLok HQ',
      },
    });
    const second = note({
      id: 'move-1',
      message: 'BluLok HQ received a tenant move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
      metadata: {
        eventType: 'ledger.moved-in',
        requiresReview: true,
        syncLogId: 'sync-b',
        subjectLabel: 'Tester Three · Unit 100',
        facilityName: 'BluLok HQ',
      },
    });
    const interrupt = {
      id: 'security',
      title: 'Security',
      message: 'Door forced',
      notificationType: 'security_alert',
      priority: 'high' as const,
      tone: 'error' as const,
      timestamp: new Date('2026-08-28T12:01:00Z'),
      isRead: false,
      isHidden: false,
      actionRequired: true,
      source: 'security' as const,
      facilityId: 'fac-hq',
      metadata: null,
    };
    const after = note({
      id: 'lead-2',
      message: 'BluLok HQ received a lead move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
      metadata: {
        eventType: 'lead.moved-in',
        requiresReview: true,
        syncLogId: 'sync-d',
        subjectLabel: 'Tester Three · Unit 100',
        facilityName: 'BluLok HQ',
      },
    });

    const grouped = groupDashboardNotifications(
      [first, second, interrupt, after],
      new Set(['sync-a', 'sync-b', 'sync-d']),
    );
    expect(grouped).toHaveLength(3);
    expect(grouped[0].instances.map((row) => row.id)).toEqual(['lead-1', 'move-1']);
    expect(grouped[1].notification.id).toBe('security');
    expect(grouped[2].instances.map((row) => row.id)).toEqual(['lead-2']);
  });

  it('marks the cluster settled when no sync logs are still open', () => {
    const rows = [
      note({
        id: 'move-1',
        message: 'BluLok HQ received a tenant move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
        metadata: {
          eventType: 'ledger.moved-in',
          requiresReview: true,
          syncLogId: 'sync-b',
          subjectLabel: 'Tester Three · Unit 100',
          facilityName: 'BluLok HQ',
        },
      }),
    ];

    const grouped = groupDashboardNotifications(rows, new Set());
    expect(grouped[0].notification.actionRequired).toBe(false);
    expect(grouped[0].notification.message).toContain('already been reviewed or dismissed');
    expect(grouped[0].notification.message).not.toContain('need your review');
  });

  it('leaves unrelated notifications ungrouped', () => {
    const rows = [
      note({
        id: 'june',
        message: 'Assign June',
        metadata: { eventType: 'ledger.moved-in', subjectLabel: 'June Marry · Unit 101' },
      }),
      {
        id: 'security',
        title: 'Security',
        message: 'Alert',
        notificationType: 'security_alert',
        priority: 'high',
        tone: 'error' as const,
        timestamp: new Date(),
        isRead: false,
        isHidden: false,
        actionRequired: true,
        source: 'security' as const,
        facilityId: 'fac-hq',
        metadata: null,
      },
    ];

    const grouped = groupDashboardNotifications(rows, new Set());
    expect(grouped).toHaveLength(2);
  });

  it('does not fold a previously read card into a new unread stack', () => {
    const unread = note({
      id: 'new-1',
      message: 'BluLok HQ received a lead move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
      metadata: {
        eventType: 'lead.moved-in',
        requiresReview: true,
        syncLogId: 'sync-new',
        subjectLabel: 'Tester Three · Unit 100',
        facilityName: 'BluLok HQ',
      },
    });
    const alreadyRead = note({
      id: 'old-1',
      isRead: true,
      message: 'BluLok HQ received a tenant move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
      metadata: {
        eventType: 'ledger.moved-in',
        requiresReview: true,
        syncLogId: 'sync-old',
        subjectLabel: 'Tester Three · Unit 100',
        facilityName: 'BluLok HQ',
      },
    });

    const grouped = groupDashboardNotifications([unread, alreadyRead], new Set(['sync-new']));
    expect(grouped).toHaveLength(2);
    expect(grouped[0].instances.map((row) => row.id)).toEqual(['new-1']);
    expect(grouped[1].instances.map((row) => row.id)).toEqual(['old-1']);
  });

  it('keeps a recorded group together after those cards are marked read', () => {
    const first = note({
      id: 'lead-1',
      isRead: true,
      message: 'BluLok HQ received a lead move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
      metadata: {
        eventType: 'lead.moved-in',
        requiresReview: true,
        syncLogId: 'sync-a',
        subjectLabel: 'Tester Three · Unit 100',
        facilityName: 'BluLok HQ',
      },
    });
    const second = note({
      id: 'move-1',
      isRead: true,
      message: 'BluLok HQ received a tenant move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
      metadata: {
        eventType: 'ledger.moved-in',
        requiresReview: true,
        syncLogId: 'sync-b',
        subjectLabel: 'Tester Three · Unit 100',
        facilityName: 'BluLok HQ',
      },
    });
    const olderRead = note({
      id: 'old-1',
      isRead: true,
      message: 'BluLok HQ received a new tenant update. 1 change needs your review before they take effect. (Tester Three (t3@blulok.com))',
      metadata: {
        eventType: 'tenant.created',
        requiresReview: true,
        syncLogId: 'sync-c',
        subjectLabel: 'Tester Three (t3@blulok.com)',
        facilityName: 'BluLok HQ',
      },
    });

    const grouped = groupDashboardNotifications(
      [first, second, olderRead],
      new Set(),
      [['lead-1', 'move-1']],
    );
    expect(grouped).toHaveLength(2);
    expect(grouped[0].instances.map((row) => row.id)).toEqual(['lead-1', 'move-1']);
    expect(grouped[0].notification.isRead).toBe(true);
    expect(grouped[1].instances.map((row) => row.id)).toEqual(['old-1']);
  });

  it('does not invent a group from independently read cards', () => {
    const first = note({
      id: 'lead-1',
      isRead: true,
      message: 'Lead',
      metadata: { eventType: 'lead.moved-in', subjectLabel: 'Tester Three · Unit 100' },
    });
    const second = note({
      id: 'move-1',
      isRead: true,
      message: 'Move-in',
      metadata: { eventType: 'ledger.moved-in', subjectLabel: 'Tester Three · Unit 100' },
    });

    const grouped = groupDashboardNotifications([first, second], new Set());
    expect(grouped).toHaveLength(2);
  });
});

describe('rememberUnreadFmsNotificationGroups', () => {
  it('records only unread multi-instance stacks', () => {
    const unreadStack = groupDashboardNotifications(
      [
        note({
          id: 'a',
          message: 'A',
          metadata: { eventType: 'lead.moved-in', subjectLabel: 'Tester Three · Unit 100' },
        }),
        note({
          id: 'b',
          message: 'B',
          metadata: { eventType: 'ledger.moved-in', subjectLabel: 'Tester Three · Unit 100' },
        }),
      ],
      new Set(),
    );
    const remembered = rememberUnreadFmsNotificationGroups(unreadStack, []);
    expect(remembered).toEqual([['a', 'b']]);

    const afterRead = rememberUnreadFmsNotificationGroups(
      groupDashboardNotifications(
        unreadStack[0].instances.map((row) => ({ ...row, isRead: true })),
        new Set(),
        remembered,
      ),
      remembered,
    );
    expect(afterRead).toEqual([['a', 'b']]);
  });
});

describe('formatGroupedFmsUpdateMessage', () => {
  it('names the facility, count, and review state', () => {
    expect(
      formatGroupedFmsUpdateMessage({
        facilityName: 'BluLok HQ',
        subject: 'Tester Three · Unit 100',
        instanceCount: 4,
        stillNeedsReview: false,
      }),
    ).toBe(
      'BluLok HQ received 4 FMS updates for Tester Three · Unit 100. Those changes have already been reviewed or dismissed.',
    );
  });
});
