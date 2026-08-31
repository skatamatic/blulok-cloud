/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { UserRole } from '@/types/auth.types';

const mockUseAuth = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ProtectedRoute', () => {
  const Child = () => <div data-testid="child">ok</div>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading while auth is loading', () => {
    mockUseAuth.mockReturnValue({
      authState: { isLoading: true, isAuthenticated: false, user: null },
      hasRole: jest.fn(() => false),
      isAdmin: jest.fn(() => false),
      canManageUsers: jest.fn(() => false),
    });

    render(
      <MemoryRouter initialEntries={['/x']}>
        <ProtectedRoute>
          <Child />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('redirects to login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      authState: { isLoading: false, isAuthenticated: false, user: null },
      hasRole: jest.fn(() => false),
      isAdmin: jest.fn(() => false),
      canManageUsers: jest.fn(() => false),
    });

    render(
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route
            path="/secret"
            element={
              <ProtectedRoute>
                <Child />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login">login</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('login')).toBeInTheDocument();
  });

  it('renders children when authenticated and roles match', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        isLoading: false,
        isAuthenticated: true,
        user: { id: '1', role: UserRole.ADMIN },
      },
      hasRole: jest.fn((roles: UserRole[]) => roles.includes(UserRole.ADMIN)),
      isAdmin: jest.fn(() => true),
      canManageUsers: jest.fn(() => true),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
          <Child />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows access denied when requiredRoles not met', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        isLoading: false,
        isAuthenticated: true,
        user: { id: '1', role: UserRole.TENANT },
      },
      hasRole: jest.fn(() => false),
      isAdmin: jest.fn(() => false),
      canManageUsers: jest.fn(() => false),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
          <Child />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
  });

  it('blocks when requireAdmin and not admin', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        isLoading: false,
        isAuthenticated: true,
        user: { id: '1', role: UserRole.TENANT },
      },
      hasRole: jest.fn(() => false),
      isAdmin: jest.fn(() => false),
      canManageUsers: jest.fn(() => false),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requireAdmin>
          <Child />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Admin Access Required/i)).toBeInTheDocument();
  });

  it('blocks when requireUserManagement and canManageUsers false', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        isLoading: false,
        isAuthenticated: true,
        user: { id: '1', role: UserRole.TENANT },
      },
      hasRole: jest.fn(() => false),
      isAdmin: jest.fn(() => false),
      canManageUsers: jest.fn(() => false),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requireUserManagement>
          <Child />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/User Management Access Required/i)).toBeInTheDocument();
  });

  it('blocks when requireDevAdmin and not dev admin', () => {
    mockUseAuth.mockReturnValue({
      authState: {
        isLoading: false,
        isAuthenticated: true,
        user: { id: '1', role: UserRole.ADMIN },
      },
      hasRole: jest.fn(() => false),
      isAdmin: jest.fn(() => true),
      canManageUsers: jest.fn(() => true),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requireDevAdmin>
          <Child />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Developer Access Required/i)).toBeInTheDocument();
  });
});
