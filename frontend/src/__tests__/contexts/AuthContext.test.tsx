/**
 * AuthProvider — session bootstrap from storage, login/logout, role helpers.
 */
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/auth.types';
import { apiService } from '@/services/api.service';
import { websocketService } from '@/services/websocket.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    verifyToken: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('@/services/websocket.service', () => ({
  websocketService: {
    retryConnectionIfNeeded: jest.fn(),
    disconnect: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;
const mockWs = websocketService as jest.Mocked<typeof websocketService>;

function Probe() {
  const { authState, login, logout, hasRole, isAdmin, canManageUsers } = useAuth();
  return (
    <div>
      <span data-testid="authed">{authState.isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="loading">{authState.isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="has-tenant">{hasRole([UserRole.TENANT]) ? 't' : 'f'}</span>
      <span data-testid="is-admin">{isAdmin() ? 'a' : 'na'}</span>
      <span data-testid="can-users">{canManageUsers() ? 'u' : 'nu'}</span>
      <button type="button" onClick={() => void login({ identifier: 'a@b.com', password: 'x' })}>
        do-login
      </button>
      <button type="button" onClick={() => void logout()}>
        do-logout
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('initializes as authenticated when storage has token and verifyToken succeeds', async () => {
    localStorage.setItem('authToken', 'tok');
    localStorage.setItem(
      'authUser',
      JSON.stringify({
        id: 'u1',
        email: 'a@b.com',
        firstName: 'A',
        lastName: 'B',
        role: UserRole.TENANT,
      })
    );
    mockApi.verifyToken.mockResolvedValueOnce({ valid: true } as never);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    expect(screen.getByTestId('authed').textContent).toBe('yes');
    expect(mockApi.verifyToken).toHaveBeenCalled();
    expect(mockWs.retryConnectionIfNeeded).toHaveBeenCalled();
  });

  it('clears storage and unauthenticates when verifyToken fails', async () => {
    localStorage.setItem('authToken', 'bad');
    localStorage.setItem('authUser', JSON.stringify({ id: 'u1', role: UserRole.TENANT }));
    mockApi.verifyToken.mockRejectedValueOnce(new Error('401'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    expect(localStorage.getItem('authToken')).toBeNull();
    expect(screen.getByTestId('authed').textContent).toBe('no');
  });

  it('login stores session and retries websocket on success', async () => {
    mockApi.login.mockResolvedValueOnce({
      success: true,
      message: 'ok',
      token: 'new-tok',
      user: {
        id: 'u1',
        email: 'a@b.com',
        firstName: 'A',
        lastName: 'B',
        role: UserRole.FACILITY_ADMIN,
      },
    } as never);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    await act(async () => {
      fireEvent.click(screen.getByText('do-login'));
    });

    await waitFor(() => {
      expect(mockApi.login).toHaveBeenCalledWith({ identifier: 'a@b.com', password: 'x' });
      expect(localStorage.getItem('authToken')).toBe('new-tok');
      expect(mockWs.retryConnectionIfNeeded).toHaveBeenCalled();
    });

    expect(screen.getByTestId('can-users').textContent).toBe('u');
    expect(screen.getByTestId('is-admin').textContent).toBe('na');
  });

  it('logout clears storage, disconnects ws, and dispatches logout', async () => {
    mockApi.logout.mockResolvedValueOnce(undefined);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    await act(async () => {
      fireEvent.click(screen.getByText('do-logout'));
    });

    await waitFor(() => {
      expect(mockApi.logout).toHaveBeenCalled();
      expect(mockWs.disconnect).toHaveBeenCalled();
    });
  });
});
