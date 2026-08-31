/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChannelHub } from '@/pages/settings/notifications/ChannelHub';
import { useState } from 'react';

function HubHarness() {
  const [enabled, setEnabled] = useState(true);
  const [pane, setPane] = useState<'setup' | 'messages'>('setup');
  return (
    <ChannelHub
      title="SMS"
      enabled={enabled}
      onEnabledChange={setEnabled}
      pane={pane}
      onPaneChange={setPane}
      offHint="Channel off"
      setup={<div>Setup content</div>}
      messages={<div>Messages content</div>}
    />
  );
}

describe('ChannelHub', () => {
  it('shows setup by default and switches to messages', async () => {
    render(<HubHarness />);
    expect(screen.getByText('Setup content')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(screen.getByText('Messages content')).toBeInTheDocument();
    expect(screen.queryByText('Setup content')).not.toBeInTheDocument();
  });

  it('hides panes when disabled', async () => {
    render(<HubHarness />);
    await userEvent.click(screen.getByRole('switch', { name: /Enable SMS/i }));
    expect(screen.getByText('Channel off')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Setup' })).not.toBeInTheDocument();
  });
});
