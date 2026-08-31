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
  it('keeps technical errors collapsed until details are expanded', async () => {
    const user = userEvent.setup();
    render(<FMSWebhookFeed events={[makeEvent()]} showPayload />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByText(/Unsupported Storable webhook event type/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByText(/Unsupported Storable webhook event type/)).toBeInTheDocument();
    expect(screen.getByText('Payload')).toBeInTheDocument();
    expect(screen.getByText(/"type": "com.storedge.lead.moved-in.v1"/)).toBeInTheDocument();
  });

  it('hides payload JSON when not inspecting', async () => {
    const user = userEvent.setup();
    render(<FMSWebhookFeed events={[makeEvent()]} />);

    expect(screen.queryByText('Copy JSON')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByText(/Unsupported Storable webhook event type/)).toBeInTheDocument();
    expect(screen.queryByText('Copy JSON')).not.toBeInTheDocument();
    expect(screen.queryByText('Payload')).not.toBeInTheDocument();
  });

  it('does not expand successful events without inspect access', () => {
    render(
      <FMSWebhookFeed
        events={[
          makeEvent({
            status: 'processed',
            errorMessage: null,
            requiresReview: false,
            changesDetected: 1,
            changesApplied: 1,
            autoApplied: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Auto-applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show details/i })).not.toBeInTheDocument();
  });
});
