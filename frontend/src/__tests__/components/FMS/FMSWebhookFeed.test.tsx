import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FMSWebhookFeed } from '@/components/FMS/FMSWebhookFeed';
import { FMSWebhookFeedItem } from '@/types/fms.types';

function makeEvent(overrides: Partial<FMSWebhookFeedItem> = {}): FMSWebhookFeedItem {
  return {
    id: 'wh-1',
    facilityId: 'fac-1',
    eventType: 'lead.moved-in',
    externalEventId: 'ext-1',
    receivedAt: '2026-08-23T20:21:15.000Z',
    summary: { eventType: 'lead.moved-in' },
    summaryText: 'Lead Moved In · tenant t1',
    changesDetected: 0,
    changesApplied: 0,
    autoApplied: false,
    requiresReview: false,
    syncLogId: '',
    status: 'failed',
    errorMessage: 'Unsupported Storable webhook event type: com.storedge.lead.moved-in.v1',
    rawPayload: {
      id: 'ext-1',
      type: 'com.storedge.lead.moved-in.v1',
      body: { tenant_id: 't1', unit_id: 'u1' },
    },
    ...overrides,
  };
}

describe('FMSWebhookFeed', () => {
  it('shows failed events and expands raw JSON for inspectors', async () => {
    const user = userEvent.setup();
    render(<FMSWebhookFeed events={[makeEvent()]} showPayload />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Unsupported Storable webhook event type/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show payload/i }));
    expect(document.querySelector('pre')?.textContent).toContain('com.storedge.lead.moved-in.v1');
  });

  it('hides payload controls when not inspecting', () => {
    render(<FMSWebhookFeed events={[makeEvent()]} />);
    expect(screen.queryByRole('button', { name: /show payload/i })).not.toBeInTheDocument();
  });
});
