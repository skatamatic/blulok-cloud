/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/Layout/Sidebar';
import { UserRole } from '@/types/auth.types';

const mockLogout = jest.fn();
const mockNavigate = jest.fn();
const mockHasRole = jest.fn(() => true);
const mockIsAdmin = jest.fn(() => true);
const mockCanManageUsers = jest.fn(() => true);
const mockToggleSidebar = jest.fn();

jest.mock('@/components/Layout/TopLevelFacilitySelector', () => ({
  TopLevelFacilitySelector: () => <div data-testid="facility-selector-stub" />,
}));

jest.mock('@/components/UserManagement/ChangePasswordModal', () => ({
  ChangePasswordModal: () => null,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: {
      user: {
        id: '1',
        firstName: 'Sam',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        email: 'sam@example.com',
      },
      isAuthenticated: true,
    },
    logout: mockLogout,
    hasRole: mockHasRole,
    isAdmin: mockIsAdmin,
    canManageUsers: mockCanManageUsers,
  }),
}));

jest.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => ({
    isCollapsed: false,
    toggleSidebar: mockToggleSidebar,
  }),
}));

jest.mock('@/contexts/BluFMSDemoContext', () => ({
  useBluFMSDemo: () => ({
    isBluFMSDemoEnabled: false,
    isLoading: false,
  }),
}));

jest.mock('@/contexts/BluDesignContext', () => ({
  useBluDesign: () => ({
    isBluDesignEnabled: false,
    isLoading: false,
  }),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasRole.mockImplementation(() => true);
    mockIsAdmin.mockImplementation(() => true);
    mockCanManageUsers.mockImplementation(() => true);
  });

  it('renders BluLok nav links for an admin', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText('BluLok Cloud')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /user management/i })).toBeInTheDocument();
    expect(screen.getByTestId('facility-selector-stub')).toBeInTheDocument();
  });

  it('hides User Management when canManageUsers is false', () => {
    mockCanManageUsers.mockImplementation(() => false);

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /user management/i })).not.toBeInTheDocument();
  });

  it('calls toggleSidebar when collapse control is used', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    await user.click(screen.getByTitle(/collapse sidebar/i));
    expect(mockToggleSidebar).toHaveBeenCalled();
  });

  it('logs out and navigates to login', async () => {
    mockLogout.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
