/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddUserModal } from '@/components/UserManagement/AddUserModal';
import { UserRole } from '@/types/auth.types';

const mockCreateUser = jest.fn();
const mockGetFacilities = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    createUser: (...args: unknown[]) => mockCreateUser(...args),
    getFacilities: () => mockGetFacilities(),
  },
}));

const mockAddToast = jest.fn();

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

const mockUseAuth = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

/** Stable auth reference — avoids extra re-renders under slow CI / coverage runs. */
const adminAuth = {
  authState: {
    user: { id: 'admin-1', role: UserRole.ADMIN, email: 'admin@test.com' },
  },
};

describe('AddUserModal', () => {
  const onClose = jest.fn();
  const onSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(adminAuth);
    mockGetFacilities.mockResolvedValue({
      success: true,
      facilities: [{ id: 'fac-1', name: 'Test Facility' }],
    });
    mockCreateUser.mockResolvedValue({ success: true });
  });

  it('creates an admin user with password', async () => {
    const user = userEvent.setup();

    render(
      <AddUserModal isOpen onClose={onClose} onSuccess={onSuccess} />
    );

    await waitFor(() => {
      expect(screen.queryByText(/loading facilities/i)).not.toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/enter first name/i), 'Ada');
    await user.type(screen.getByPlaceholderText(/enter last name/i), 'Test');
    await user.type(screen.getByPlaceholderText(/enter email address/i), 'ada@test.com');

    await user.selectOptions(screen.getByRole('combobox'), UserRole.ADMIN);

    await user.type(screen.getByPlaceholderText('Enter password'), 'Aa1!aaaaaa');
    await user.type(screen.getByPlaceholderText('Confirm password'), 'Aa1!aaaaaa');

    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ada@test.com',
          firstName: 'Ada',
          lastName: 'Test',
          role: UserRole.ADMIN,
          password: 'Aa1!aaaaaa',
        })
      );
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  }, 15_000);

  it('requires facility assignment for tenant role', async () => {
    const user = userEvent.setup();

    render(
      <AddUserModal isOpen onClose={onClose} onSuccess={onSuccess} />
    );

    await waitFor(() => {
      expect(screen.queryByText(/loading facilities/i)).not.toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/enter first name/i), 'Bob');
    await user.type(screen.getByPlaceholderText(/enter last name/i), 'Tenant');
    await user.type(screen.getByPlaceholderText(/enter email address/i), 'bob@test.com');
    await user.selectOptions(screen.getByRole('combobox'), UserRole.TENANT);

    await waitFor(() => {
      expect(screen.getByText(/Test Facility/i)).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Enter password'), 'Bb1!bbbbbb');
    await user.type(screen.getByPlaceholderText('Confirm password'), 'Bb1!bbbbbb');

    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getByText(/select at least one facility/i)).toBeInTheDocument();
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  }, 15_000);
});
