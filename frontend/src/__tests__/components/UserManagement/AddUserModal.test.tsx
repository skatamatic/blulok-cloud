/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddUserModal } from '@/components/UserManagement/AddUserModal';
import { UserRole } from '@/types/auth.types';
import { AxiosError } from 'axios';

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

function axiosConflict(data: Record<string, unknown>) {
  const error = new AxiosError('Conflict');
  error.response = {
    status: 409,
    data,
    statusText: 'Conflict',
    headers: {},
    config: {} as any,
  };
  return error;
}

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
    expect(screen.getByPlaceholderText(/enter email address/i)).toHaveAttribute('autoComplete', 'off');
    expect(screen.getByPlaceholderText(/^enter password$/i)).toHaveAttribute(
      'autoComplete',
      'new-password',
    );

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
    await user.type(screen.getByPlaceholderText('Enter password'), 'Bb1!bbbbbb');
    await user.type(screen.getByPlaceholderText('Confirm password'), 'Bb1!bbbbbb');

    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getByText(/select at least one facility/i)).toBeInTheDocument();
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  }, 15_000);

  it('prompts to reactivate when create returns USER_INACTIVE conflict', async () => {
    const user = userEvent.setup();
    mockCreateUser
      .mockRejectedValueOnce(
        axiosConflict({
          success: false,
          code: 'USER_INACTIVE',
          message:
            'An inactive user with this email already exists. Confirm to reactivate and update their profile.',
          inactiveUser: {
            id: 'inactive-1',
            email: 'gone@test.com',
            firstName: 'Gone',
            lastName: 'User',
            role: UserRole.TENANT,
          },
        }),
      )
      .mockResolvedValueOnce({
        success: true,
        reactivated: true,
        userId: 'inactive-1',
      });

    render(
      <AddUserModal isOpen onClose={onClose} onSuccess={onSuccess} />
    );

    await waitFor(() => {
      expect(screen.queryByText(/loading facilities/i)).not.toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/enter first name/i), 'Restored');
    await user.type(screen.getByPlaceholderText(/enter last name/i), 'Name');
    await user.type(screen.getByPlaceholderText(/enter email address/i), 'gone@test.com');
    await user.selectOptions(screen.getByRole('combobox'), UserRole.ADMIN);
    await user.type(screen.getByPlaceholderText('Enter password'), 'Aa1!aaaaaa');
    await user.type(screen.getByPlaceholderText('Confirm password'), 'Aa1!aaaaaa');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getByText(/reactivate existing user/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Gone User/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reactivate user/i }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenLastCalledWith(
        expect.objectContaining({
          email: 'gone@test.com',
          reactivateIfInactive: true,
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'User reactivated' }),
    );
  }, 20_000);

  it('keeps the form open when reactivation prompt is cancelled', async () => {
    const user = userEvent.setup();
    mockCreateUser.mockRejectedValueOnce(
      axiosConflict({
        success: false,
        code: 'USER_INACTIVE',
        message: 'An inactive user with this email already exists.',
        inactiveUser: {
          id: 'inactive-1',
          email: 'gone@test.com',
          firstName: 'Gone',
          lastName: 'User',
          role: UserRole.TENANT,
        },
      }),
    );

    render(
      <AddUserModal isOpen onClose={onClose} onSuccess={onSuccess} />
    );

    await waitFor(() => {
      expect(screen.queryByText(/loading facilities/i)).not.toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/enter first name/i), 'Restored');
    await user.type(screen.getByPlaceholderText(/enter last name/i), 'Name');
    await user.type(screen.getByPlaceholderText(/enter email address/i), 'gone@test.com');
    await user.selectOptions(screen.getByRole('combobox'), UserRole.ADMIN);
    await user.type(screen.getByPlaceholderText('Enter password'), 'Aa1!aaaaaa');
    await user.type(screen.getByPlaceholderText('Confirm password'), 'Aa1!aaaaaa');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getByText(/reactivate existing user/i)).toBeInTheDocument();
    });

    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
    await user.click(cancelButtons[cancelButtons.length - 1]!);

    await waitFor(() => {
      expect(screen.queryByText(/reactivate existing user/i)).not.toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
  }, 20_000);
});
