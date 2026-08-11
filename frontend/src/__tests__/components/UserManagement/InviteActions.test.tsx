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

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: jest.fn() }),
}));

describe('InviteActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('disables invites for placeholders', () => {
    render(
      <InviteActions
        user={{ id: 'u1', firstName: 'A', lastName: 'B', lastLogin: null, isPlaceholder: true }}
      />,
    );
    expect(screen.getByText(/Add email\/phone/i)).toBeInTheDocument();
  });
});
