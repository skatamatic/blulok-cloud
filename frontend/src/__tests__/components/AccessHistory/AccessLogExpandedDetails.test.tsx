/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessLogExpandedDetails } from '@/components/AccessHistory/AccessLogExpandedDetails';
import type { AccessLog } from '@/types/access-history.types';

const deniedLog: AccessLog = {
  id: 'log-1',
  device_id: 'dev-1',
  device_type: 'access_control',
  action: 'unlock_attempt',
  method: 'admin_remote',
  success: false,
  occurred_at: '2026-06-22T12:11:00.000Z',
  created_at: '2026-06-22T12:11:00.000Z',
  updated_at: '2026-06-22T12:11:00.000Z',
  user_id: 'user-1',
  user_name: 'Developer Admin',
  metadata: {
    failure_summary: 'Timed out waiting for gateway confirmation',
    user: {
      id: 'user-1',
      name: 'Developer Admin',
      navigation_url: '/users/user-1/details',
    },
    device: {
      id: 'dev-1',
      name: 'Main Gate',
      location: 'Main entrance',
      navigation_url: '/devices/access-control/dev-1',
    },
  },
};

describe('AccessLogExpandedDetails', () => {
  it('renders failure reason callout and quick links', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();

    render(
      <AccessLogExpandedDetails
        log={deniedLog}
        hideFacility
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByLabelText('Failure reason')).toBeInTheDocument();
    expect(screen.getByText('Timed out waiting for gateway confirmation')).toBeInTheDocument();
    expect(screen.getByText('Main entrance')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Developer Admin/i }));
    expect(onNavigate).toHaveBeenCalledWith('/users/user-1/details', 'user-1', 'user');
  });
});
