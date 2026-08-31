/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteActions } from '@/components/UserManagement/InviteActions';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    resendUserInvite: jest.fn().mockResolvedValue({ success: true }),
    resetUserAccount: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
  },
}));

const addToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast }),
}));

describe('InviteActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiService.resendUserInvite as jest.Mock).mockResolvedValue({ success: true });
    (apiService.resetUserAccount as jest.Mock).mockResolvedValue({
      success: true,
      message: 'ok',
      inviteSent: true,
    });
  });

  it('shows resend for users who have not logged in', () => {
    render(
      <InviteActions
        user={{ id: 'u1', firstName: 'A', lastName: 'B', lastLogin: null, isPlaceholder: false }}
      />,
    );
    expect(screen.getByRole('button', { name: /Resend Invite/i })).toBeInTheDocument();
  });

  it('confirms before resending an invite', async () => {
    render(
      <InviteActions
        user={{ id: 'u1', firstName: 'A', lastName: 'B', lastLogin: null, isPlaceholder: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Resend Invite/i }));
    expect(screen.getByText(/Send a new invite to A B/i)).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: /Resend invite/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
    await waitFor(() => {
      expect(apiService.resendUserInvite).toHaveBeenCalledWith('u1');
    });
  });

  it('shows reset for users who have logged in', () => {
    render(
      <InviteActions
        user={{
          id: 'u1',
          firstName: 'A',
          lastName: 'B',
          lastLogin: '2024-01-01',
          isPlaceholder: false,
        }}
      />,
    );
    const reset = screen.getByRole('button', { name: /Reset Account/i });
    expect(reset).toBeInTheDocument();
    expect(reset.className).toContain('btn-warning');
  });

  it('uses inviteStatus active for compact reset label', () => {
    render(
      <InviteActions
        size="compact"
        fullWidth
        user={{
          id: 'u1',
          firstName: 'A',
          lastName: 'B',
          inviteStatus: 'active',
          lastLogin: null,
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /Reset account/i })).toBeInTheDocument();
  });

  it('warns instead of celebrating when only one invite channel delivered', async () => {
    (apiService.resendUserInvite as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Invite resent via SMS',
      inviteSent: true,
      inviteWarning: 'Invite sent via SMS, but email delivery failed.',
    });

    render(
      <InviteActions
        user={{ id: 'u1', firstName: 'A', lastName: 'B', lastLogin: null, isPlaceholder: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Resend Invite/i }));
    const confirmButtons = screen.getAllByRole('button', { name: /Resend invite/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          message: 'Invite sent via SMS, but email delivery failed.',
        }),
      );
    });
  });

  it('flags a reset whose invite never reached the user', async () => {
    (apiService.resetUserAccount as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Account reset, but the invite was not delivered',
      inviteSent: false,
      inviteWarning: 'Account was reset, but the invite could not be sent.',
    });

    render(
      <InviteActions
        user={{
          id: 'u1',
          firstName: 'A',
          lastName: 'B',
          lastLogin: '2024-01-01',
          isPlaceholder: false,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Reset Account/i }));
    fireEvent.click(screen.getByRole('button', { name: /Reset & Re-invite/i }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          title: expect.stringContaining('invite not delivered'),
        }),
      );
    });
  });

  it('disables invites for placeholders', () => {
    render(
      <InviteActions
        user={{ id: 'u1', firstName: 'A', lastName: 'B', lastLogin: null, isPlaceholder: true }}
      />,
    );
    expect(screen.getByText(/Add email\/phone/i)).toBeInTheDocument();
  });
});
