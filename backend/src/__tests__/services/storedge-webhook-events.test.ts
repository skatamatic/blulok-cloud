import { resolveStoredgeWebhookType } from '@/services/fms/storedge-webhook-events';

describe('resolveStoredgeWebhookType', () => {
  it('maps lead.moved-in onto the ledger assign path', () => {
    expect(resolveStoredgeWebhookType('com.storedge.lead.moved-in.v1')).toEqual({
      eventType: 'lead.moved-in',
      disposition: 'apply',
      applyAs: 'ledger.moved-in',
    });
  });

  it('ignores lead.created and contact events', () => {
    expect(resolveStoredgeWebhookType('com.storedge.lead.created.v1').disposition).toBe('ignored');
    expect(resolveStoredgeWebhookType('com.storedge.contact.updated.v1')).toEqual({
      eventType: 'contact.updated',
      disposition: 'ignored',
    });
  });

  it('ignores unrecognized Storable types without throwing', () => {
    expect(resolveStoredgeWebhookType('com.storedge.future.event.v1')).toEqual({
      eventType: 'future.event',
      disposition: 'ignored',
    });
  });
});
