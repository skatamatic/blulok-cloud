import {
  buildFmsUpdatePushNotification,
  describeFmsUpdatePushSubject,
  describeFmsWebhookOutcome,
  labelsFromFmsChangePayloads,
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

  it('describes partial auto-apply with remaining review', () => {
    expect(
      describeFmsWebhookOutcome({
        changesDetected: 3,
        changesApplied: 1,
        autoApplied: false,
        requiresReview: true,
      }),
    ).toBe('1 auto-applied, 2 need review.');
  });

  it('builds user-friendly FMS update push notification copy', () => {
    const content = buildFmsUpdatePushNotification({
      facilityName: 'Kyle Test Facility',
      eventType: 'unit.created',
      payloadData: { unit_id: 'unit-demo-001' },
      changesDetected: 1,
      changesApplied: 0,
      autoApplied: false,
      requiresReview: true,
    });
    expect(content.title).toBe('FMS Update Push');
    expect(content.message).toContain('Kyle Test Facility');
    expect(content.message).toContain('unit created');
    expect(content.message).toContain('needs your review');
    expect(content.subjectLabel).toBe('Unit unit-demo-001');
    expect(content.statusLabel).toBe('Needs your review');
  });

  it('does not use Storable UUIDs as the notification subject', () => {
    expect(
      describeFmsUpdatePushSubject({
        unit_id: 'f1c0acb8-3cd8-49ac-8cf7-102eaac7633a',
        tenant_id: '54e4154d-1984-4bb9-89a2-88af79793a66',
      }),
    ).toBeUndefined();
  });

  it('prefers mapped unit number and tenant name over raw ids', () => {
    expect(
      describeFmsUpdatePushSubject(
        { unit_id: 'f1c0acb8-3cd8-49ac-8cf7-102eaac7633a' },
        { tenantLabel: 'Jane Doe', unitLabel: 'WS-01' },
      ),
    ).toBe('Jane Doe · Unit WS-01');
  });

  it('reads display labels from change payloads', () => {
    expect(
      labelsFromFmsChangePayloads([
        { after_data: { unitNumber: '101', firstName: 'Alex', lastName: 'Kim' } },
      ]),
    ).toEqual({ tenantLabel: 'Alex Kim', unitLabel: '101' });
  });

  it('omits opaque ids from webhook feed summaries', () => {
    const { summaryText } = summarizeFmsWebhookPayload({
      ...basePayload,
      event_type: 'ledger.moved-in',
      data: {
        tenant_id: '54e4154d-1984-4bb9-89a2-88af79793a66',
        unit_id: 'f1c0acb8-3cd8-49ac-8cf7-102eaac7633a',
      },
    }, { unitLabel: 'WS-01', tenantLabel: 'Jane Doe' });
    expect(summaryText).toContain('Jane Doe');
    expect(summaryText).toContain('unit WS-01');
    expect(summaryText).not.toContain('f1c0acb8');
  });
});
