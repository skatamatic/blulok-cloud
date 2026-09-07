import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '@/pages/SettingsPage';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/api.service', () => ({
  apiService: {
    getSystemSettings: jest.fn(),
    updateSystemSettings: jest.fn(),
    resetWidgetLayout: jest.fn(),
    resetWidgetLayoutDefaults: jest.fn(),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: jest.fn(),
}));

jest.mock('@/pages/settings/DashboardSettingsTab', () => ({
  __esModule: true,
  default: () => <div>Merged dashboard settings</div>,
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;

function renderSettings(initialEntry = '/settings?tab=security') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: {
          role: UserRole.DEV_ADMIN,
        },
      },
      hasRole: (roles: UserRole[]) => roles.includes(UserRole.DEV_ADMIN),
      isAdmin: () => true,
    } as any);

    mockUseTheme.mockReturnValue({
      theme: 'light',
      setTheme: jest.fn(),
    } as any);

    mockUseToast.mockReturnValue({
      addToast: jest.fn(),
    } as any);

    mockApi.resetWidgetLayout.mockResolvedValue({ success: true });
    mockApi.updateSystemSettings.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows limited tabs for tenants', () => {
    mockUseAuth.mockReturnValue({
      authState: { user: { role: UserRole.TENANT } },
      hasRole: (roles: UserRole[]) => roles.includes(UserRole.TENANT),
      isAdmin: () => false,
    } as any);

    renderSettings('/settings');

    expect(screen.getByRole('button', { name: /appearance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /system information/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^dashboard$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dashboard library/i })).not.toBeInTheDocument();
  });

  it('shows merged dashboard tab for admins', () => {
    renderSettings('/settings?tab=dashboard');

    expect(screen.getByRole('button', { name: /^dashboard$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dashboard library/i })).not.toBeInTheDocument();
    expect(screen.getByText(/merged dashboard settings/i)).toBeInTheDocument();
  });

  it('maps legacy dashboard library tab to dashboard', () => {
    renderSettings('/settings?tab=dashboards');

    expect(screen.getByText(/merged dashboard settings/i)).toBeInTheDocument();
  });

  it('displays unlimited state when max devices is 0', async () => {
    mockApi.getSystemSettings.mockResolvedValue({
      success: true,
      settings: {
        'security.max_devices_per_user': 0,
      },
    });

    renderSettings('/settings?tab=security');

    await waitFor(() => {
      expect(screen.getByText(/Unlimited devices enabled/)).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Maximum Devices Per User/i) as HTMLInputElement;
    expect(input.value).toBe('0');
  });

  it('clamps device limit input to 250 when exceeding maximum', async () => {
    mockApi.getSystemSettings.mockResolvedValue({
      success: true,
      settings: {
        'security.max_devices_per_user': 2,
      },
    });

    renderSettings('/settings?tab=security');

    const input = await screen.findByLabelText(/Maximum Devices Per User/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '300' } });

    expect(input.value).toBe('250');
  });
});
