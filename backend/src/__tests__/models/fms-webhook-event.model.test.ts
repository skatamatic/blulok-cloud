import { FMSWebhookEventModel } from '@/models/fms-webhook-event.model';

describe('FMSWebhookEventModel.isProcessed', () => {
  const model = new FMSWebhookEventModel();

  it('returns false when processed_at is null', () => {
    expect(
      model.isProcessed({
        id: '1',
        facility_id: 'fac',
        external_event_id: 'evt-1',
        event_type: 'tenant.updated',
        received_at: new Date(),
        processed_at: null,
        sync_log_id: 'sync-1',
      })
    ).toBe(false);
  });

  it('returns true when processed_at is set', () => {
    expect(
      model.isProcessed({
        id: '1',
        facility_id: 'fac',
        external_event_id: 'evt-1',
        event_type: 'tenant.updated',
        received_at: new Date(),
        processed_at: new Date(),
        sync_log_id: 'sync-1',
      })
    ).toBe(true);
  });
});
