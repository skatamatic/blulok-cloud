/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChannelPreferenceSection } from '@/pages/settings/notifications/ChannelPreferenceSection';
import type { NotificationsConfig } from '@/types/notification.types';

const baseConfig: NotificationsConfig = {
  enabledChannels: { sms: true, email: true },
  channelPreference: 'both',
  defaultProvider: { sms: 'console', email: 'console' },
  templates: {},
};

describe('ChannelPreferenceSection', () => {
  it('is hidden when not visible', () => {
    render(
      <ChannelPreferenceSection config={baseConfig} visible={false} onChange={jest.fn()} />,
    );
    expect(screen.queryByLabelText('Channel preference')).not.toBeInTheDocument();
  });

  it('lets the admin choose prefer SMS / prefer email / both', async () => {
    const onChange = jest.fn();
    render(<ChannelPreferenceSection config={baseConfig} visible onChange={onChange} />);

    expect(screen.getByRole('tab', { name: 'Always send both' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Prefer SMS' }));
    expect(onChange).toHaveBeenCalledWith('channelPreference', 'prefer_sms');
  });
});
