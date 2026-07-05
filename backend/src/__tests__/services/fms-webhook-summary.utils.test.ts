import {
  describeFmsWebhookOutcome,
  summarizeFmsWebhookPayload,
} from '@/services/fms/fms-webhook-summary.utils';
import { FMSWebhookPayload } from '@/types/fms.types';

describe('fms-webhook-summary.utils', () => {
  const basePayload: FMSWebhookPayload = {
    externalEventId: 'evt-1',
    event_type: 'tenant.updated',
    timestamp: '2026-07-05T12:00:00.000Z',
    facility_external_id: 'fac-ext-1',
    data: {
      tenant_id: 'ten-99',
      first_name: 'Alex',
      last_name: 'Kim',
      email: 'alex@example.com',
    },
  };

  it('summarizes tenant webhook payloads', () => {
    const { summaryText, summary } = summarizeFmsWebhookPayload(basePayload);
    expect(summaryText).toContain('Tenant Updated');
    expect(summaryText).toContain('Alex Kim');
    expect(summaryText).toContain('alex@example.com');
    expect(summary.eventType).toBe('tenant.updated');
    expect(summary.body).toEqual(basePayload.data);
  });

  it('describes auto-applied webhook outcomes', () => {
    expect(
      describeFmsWebhookOutcome({
        changesDetected: 2,
        autoApplied: true,
        requiresReview: false,
      }),
    ).toBe('2 change(s) auto-applied.');
  });

  it('describes pending review webhook outcomes', () => {
    expect(
      describeFmsWebhookOutcome({
        changesDetected: 1,
        autoApplied: false,
        requiresReview: true,
      }),
    ).toBe('1 change(s) pending review.');
  });
});
