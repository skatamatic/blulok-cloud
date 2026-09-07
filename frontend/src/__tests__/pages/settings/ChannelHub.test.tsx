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

  it('shows the template variables button on the messages pane', async () => {
    function HelpHub() {
      const [enabled, setEnabled] = useState(true);
      const [pane, setPane] = useState<'setup' | 'messages'>('setup');
      return (
        <ChannelHub
          title="Email"
          enabled={enabled}
          onEnabledChange={setEnabled}
          pane={pane}
          onPaneChange={setPane}
          offHint="Channel off"
          setup={<div>Setup content</div>}
          messages={<div>Messages content</div>}
          templateChannel="email"
        />
      );
    }

    render(<HelpHub />);
    expect(screen.queryByRole('button', { name: 'Template variables' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Template variables' }));
    expect(screen.getByText('Template variables')).toBeInTheDocument();
    expect(screen.getByText(/Insert a token/i)).toBeInTheDocument();
  });
});
