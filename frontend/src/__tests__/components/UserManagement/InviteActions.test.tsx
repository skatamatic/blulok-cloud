/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { InviteActions } from '@/components/UserManagement/InviteActions';

jest.mock('@/services/api.service', () => ({
  apiService: {
    resendUserInvite: jest.fn(),
    resetUserAccount: jest.fn(),
  },
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: jest.fn() }),
}));

describe('InviteActions', () => {
  it('shows resend for users who have not logged in', () => {
    render(
      <InviteActions
        user={{ id: 'u1', firstName: 'A', lastName: 'B', lastLogin: null, isPlaceholder: false }}
      />,
    );
    expect(screen.getByRole('button', { name: /Resend Invite/i })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Reset Account/i })).toBeInTheDocument();
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
