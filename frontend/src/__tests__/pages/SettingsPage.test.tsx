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

const mockApi = apiService as jest.Mocked<typeof apiService>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;

describe('SettingsPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: {
          role: UserRole.DEV_ADMIN,
        },
      },
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

  it('displays unlimited state when max devices is 0', async () => {
    mockApi.getSystemSettings.mockResolvedValue({
      success: true,
      settings: {
        'security.max_devices_per_user': 0,
      },
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unlimited devices enabled/)).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Maximum Devices Per User') as HTMLInputElement;
    expect(input.value).toBe('0');
  });

  it('clamps device limit input to 250 when exceeding maximum', async () => {
    mockApi.getSystemSettings.mockResolvedValue({
      success: true,
      settings: {
        'security.max_devices_per_user': 2,
      },
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    const input = await screen.findByLabelText('Maximum Devices Per User') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '300' } });

    expect(input.value).toBe('250');
  });
});


