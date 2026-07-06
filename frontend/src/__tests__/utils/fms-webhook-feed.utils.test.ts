import {
  FMS_WEBHOOK_FEED_LIMIT,
  getWebhookFeedOutcomeLabel,
  mergeWebhookFeed,
  reconcileWebhookFeedReview,
} from '@/utils/fms-webhook-feed.utils';
import { FMSWebhookFeedItem } from '@/types/fms.types';

function makeEvent(id: string): FMSWebhookFeedItem {
  return {
    id,
    facilityId: 'fac-1',
    eventType: 'tenant.updated',
    externalEventId: `ext-${id}`,
    receivedAt: '2026-07-05T12:00:00.000Z',
    summary: {},
    summaryText: `Event ${id}`,
    changesDetected: 1,
    changesApplied: 0,
    autoApplied: false,
    requiresReview: true,
    syncLogId: 'sync-1',
  };
}

describe('fms-webhook-feed.utils', () => {
  it('keeps only the latest five webhook events', () => {
    let feed: FMSWebhookFeedItem[] = [];
    for (let i = 1; i <= 6; i += 1) {
      feed = mergeWebhookFeed(feed, makeEvent(String(i)));
    }
    expect(feed).toHaveLength(FMS_WEBHOOK_FEED_LIMIT);
    expect(feed[0]?.id).toBe('6');
    expect(feed[4]?.id).toBe('2');
  });

  it('labels pending review outcomes', () => {
    expect(getWebhookFeedOutcomeLabel(makeEvent('1'))).toBe('Pending review');
  });

  it('labels partial auto-apply outcomes', () => {
    expect(
      getWebhookFeedOutcomeLabel({
        ...makeEvent('1'),
        changesDetected: 3,
        changesApplied: 1,
        requiresReview: true,
        autoApplied: false,
      }),
    ).toBe('1 applied · 2 need review');
  });

  it('clears stale requiresReview when open pending log is gone', () => {
    const events = [makeEvent('1'), { ...makeEvent('2'), requiresReview: false, autoApplied: true }];
    const reconciled = reconcileWebhookFeedReview(events, null);
    expect(reconciled[0]?.requiresReview).toBe(false);
    expect(reconciled[1]?.requiresReview).toBe(false);
  });

  it('keeps requiresReview only for the open pending sync log', () => {
    const events = [
      { ...makeEvent('1'), syncLogId: 'sync-open' },
      { ...makeEvent('2'), syncLogId: 'sync-done' },
    ];
    const reconciled = reconcileWebhookFeedReview(events, 'sync-open');
    expect(reconciled[0]?.requiresReview).toBe(true);
    expect(reconciled[1]?.requiresReview).toBe(false);
  });
});
