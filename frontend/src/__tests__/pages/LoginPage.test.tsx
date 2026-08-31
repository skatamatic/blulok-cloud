/**
 * LoginPage — auth flow, error mapping, and error auto-clear timer (fake timers, cleaned up).
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LoginPage from '@/pages/LoginPage';
import { isViteDev } from '@/services/appConfig';
import { DEV_QUICK_LOGIN_ACCOUNTS } from '@/config/devTestAccounts';

const mockIsViteDev = isViteDev as jest.MockedFunction<typeof isViteDev>;

const mockNavigate = jest.fn();
const mockLogin = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/login', state: null as unknown }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    authState: {
      isLoading: false,
      isAuthenticated: false,
      user: null,
    },
  }),
}));

jest.mock('@/services/appConfig', () => ({
  isViteDev: jest.fn(() => false),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    localStorage.clear();
    mockIsViteDev.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders sign-in form', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: /sign in to blulok cloud/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email or phone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('navigates to dashboard on successful login', async () => {
    mockLogin.mockResolvedValueOnce({ success: true, message: 'ok' });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email or phone/i), {
      target: { value: 'admin@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        identifier: 'admin@test.com',
        password: 'secret',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('shows API error message when login returns success: false', async () => {
    mockLogin.mockResolvedValueOnce({ success: false, message: 'Bad credentials' });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email or phone/i), {
      target: { value: 'u@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByText('Bad credentials')).toBeInTheDocument();
    });
  });

  it('maps 401 axios errors to a user-friendly message', async () => {
    mockLogin.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'nope' } },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email or phone/i), {
      target: { value: 'u@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/invalid email or password\. please check your credentials/i)
      ).toBeInTheDocument();
    });
  });

  it('shows dev quick-login buttons when running in Vite dev mode', () => {
    mockIsViteDev.mockReturnValue(true);

    render(<LoginPage />);

    expect(screen.getByText(/quick login with test accounts/i)).toBeInTheDocument();
    for (const account of DEV_QUICK_LOGIN_ACCOUNTS) {
      expect(screen.getByText(account.email)).toBeInTheDocument();
    }
  });

  it('logs in via dev quick-login button', async () => {
    mockIsViteDev.mockReturnValue(true);
    mockLogin.mockResolvedValueOnce({ success: true, message: 'ok' });

    render(<LoginPage />);

    fireEvent.click(screen.getByText('dev.tenant@blulok.com'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        identifier: 'dev.tenant@blulok.com',
        password: 'DevTest123!@#',
      });
    });
  });

  it('clears displayed error after 5s using a timer that is cleaned up', async () => {
    jest.useFakeTimers();

    mockLogin.mockRejectedValueOnce({
      response: { status: 500, data: {} },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email or phone/i), {
      target: { value: 'u@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByText(/server error occurred/i)).toBeInTheDocument();
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(screen.queryByText(/server error occurred/i)).not.toBeInTheDocument();
    });
  });
});
