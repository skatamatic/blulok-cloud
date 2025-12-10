import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/contexts/ToastContext';
import DeviceDetailsPage from '@/pages/DeviceDetailsPage';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/contexts/WebSocketContext';

jest.mock('@/services/api.service');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: jest.fn(),
}));

// Mock WebSocket context
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();
jest.mock('@/contexts/WebSocketContext', () => ({
  ...jest.requireActual('@/contexts/WebSocketContext'),
  useWebSocket: jest.fn(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  })),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
  useParams: () => ({ deviceId: 'device-1' }),
}));

const mockDevice = {
  id: 'device-1',
  device_serial: 'SN123456',
  unit_id: 'unit-1',
  unit_number: 'A-101',
  facility_id: 'facility-1',
  facility_name: 'Main Facility',
  lock_status: 'locked',
  device_status: 'online',
  battery_level: 85,
  signal_strength: -55,
  temperature: 22.5,
  error_code: null,
  error_message: null,
  last_activity: '2024-01-15T10:30:00Z',
  last_seen: '2024-01-15T10:30:00Z',
  firmware_version: '1.0.0',
  primary_tenant: {
    id: 'tenant-1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
  },
};

const mockDeviceWithError = {
  ...mockDevice,
  device_status: 'error',
  error_code: 'LOW_BATTERY',
  error_message: 'Battery level critically low',
};

const mockDeviceWithWeakSignal = {
  ...mockDevice,
  signal_strength: -85, // Weak signal
  temperature: 55, // High temp
};

const mockDenylistEntries = [
  {
    id: 'entry-1',
    device_id: 'device-1',
    user_id: 'user-1',
    expires_at: '2024-12-31T23:59:59Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    created_by: 'admin-1',
    source: 'unit_unassignment',
    user: {
      id: 'user-1',
      email: 'denied@example.com',
      first_name: 'Denied',
      last_name: 'User',
    },
  },
];

describe('DeviceDetailsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      authState: {
        user: { id: 'admin-id', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
        isLoading: false,
      },
    });

    mockApiService.getBluLokDevice.mockResolvedValue({
      success: true,
      device: mockDevice,
    } as any);
    mockApiService.getDeviceDenylist.mockResolvedValue({
      success: true,
      entries: [],
    });
  });

  it('renders device overview tab by default', async () => {
    render(
      <MemoryRouter initialEntries={['/devices/device-1']}>
        <ToastProvider>
          <DeviceDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Device Details')).toBeInTheDocument();
    });

    expect(screen.getByText('SN123456')).toBeInTheDocument();
    const matches = screen.getAllByText((_, node) => node?.textContent?.includes('Unit A-101') || false);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('switches to denylist tab and loads entries', async () => {
    mockApiService.getDeviceDenylist.mockResolvedValue({
      success: true,
      entries: mockDenylistEntries,
    });

    render(
      <MemoryRouter initialEntries={['/devices/device-1']}>
        <ToastProvider>
          <DeviceDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Device Details')).toBeInTheDocument();
    });

    const denylistTab = screen.getByText('Denylist');
    fireEvent.click(denylistTab);

    await waitFor(() => {
      expect(mockApiService.getDeviceDenylist).toHaveBeenCalledWith('device-1');
      expect(screen.getByText('Denied User')).toBeInTheDocument();
    });
  });

  it('displays empty state when no denylist entries', async () => {
    render(
      <MemoryRouter initialEntries={['/devices/device-1?tab=denylist']}>
        <ToastProvider>
          <DeviceDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No denylist entries')).toBeInTheDocument();
    });
  });

  it('displays denylist entries with expiration info', async () => {
    mockApiService.getDeviceDenylist.mockResolvedValue({
      success: true,
      entries: mockDenylistEntries,
    });

    render(
      <MemoryRouter initialEntries={['/devices/device-1?tab=denylist']}>
        <ToastProvider>
          <DeviceDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Denied User')).toBeInTheDocument();
      expect(screen.getByText('denied@example.com')).toBeInTheDocument();
      expect(screen.getByText('Unit Unassigned')).toBeInTheDocument();
    });
  });

  it('handles device not found error', async () => {
    mockApiService.getBluLokDevice.mockResolvedValue({
      success: false,
      error: 'Not found',
    } as any);

    render(
      <MemoryRouter initialEntries={['/devices/device-1']}>
        <ToastProvider>
          <DeviceDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Device not found|Failed to load device details/)).toBeInTheDocument();
    });
  });

  it('navigates back to devices list', async () => {
    const mockNavigate = jest.fn();
    jest.spyOn(require('react-router-dom'), 'useNavigate').mockReturnValue(mockNavigate);

    render(
      <MemoryRouter initialEntries={['/devices/device-1']}>
        <ToastProvider>
          <DeviceDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Back'));
    expect(mockNavigate).toHaveBeenCalledWith('/devices');
  });

  it('reloads device details on lock command failure', async () => {
    mockApiService.getBluLokDevice.mockResolvedValue({
      success: true,
      device: mockDevice,
    } as any);

    mockApiService.updateLockStatus.mockRejectedValueOnce(new Error('Gateway error'));

    render(
      <MemoryRouter initialEntries={['/devices/device-1']}>
        <ToastProvider>
          <DeviceDetailsPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Device Details')).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /Unlock/i });
    fireEvent.click(button);

    await waitFor(() => {
      // Ensure updateLockStatus was attempted
      expect(mockApiService.updateLockStatus).toHaveBeenCalledWith('device-1', 'unlocked');
    });
  });

  describe('Telemetry Fields Display', () => {
    it('displays signal strength with quality indicator', async () => {
      render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      // Click on Overview tab to ensure we're on the right tab
      const overviewTab = screen.getByRole('button', { name: /overview/i });
      fireEvent.click(overviewTab);

      await waitFor(() => {
        expect(screen.getByText('Signal Strength')).toBeInTheDocument();
      });

      // -55 dBm is >= -60, so it shows "Good" (Excellent is >= -50)
      expect(screen.getByText('-55 dBm')).toBeInTheDocument();
      expect(screen.getByText('(Good)')).toBeInTheDocument();
    });

    it('displays temperature', async () => {
      render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      // Click on Overview tab
      const overviewTab = screen.getByRole('button', { name: /overview/i });
      fireEvent.click(overviewTab);

      await waitFor(() => {
        expect(screen.getByText('Temperature')).toBeInTheDocument();
      });

      expect(screen.getByText('22.5°C')).toBeInTheDocument();
    });

    it('displays error information when device has errors', async () => {
      mockApiService.getBluLokDevice.mockResolvedValue({
        success: true,
        device: mockDeviceWithError,
      } as any);

      render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      // Click on Overview tab
      const overviewTab = screen.getByRole('button', { name: /overview/i });
      fireEvent.click(overviewTab);

      await waitFor(() => {
        expect(screen.getByText(/Error: LOW_BATTERY/)).toBeInTheDocument();
      });

      expect(screen.getByText('Battery level critically low')).toBeInTheDocument();
    });

    it('shows weak signal warning for poor signal strength', async () => {
      mockApiService.getBluLokDevice.mockResolvedValue({
        success: true,
        device: mockDeviceWithWeakSignal,
      } as any);

      render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      // Click on Overview tab
      const overviewTab = screen.getByRole('button', { name: /overview/i });
      fireEvent.click(overviewTab);

      await waitFor(() => {
        expect(screen.getByText('-85 dBm')).toBeInTheDocument();
      });

      expect(screen.getByText('(Weak)')).toBeInTheDocument();
    });

    it('shows high temperature warning', async () => {
      mockApiService.getBluLokDevice.mockResolvedValue({
        success: true,
        device: mockDeviceWithWeakSignal, // Has temp 55°C
      } as any);

      render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      // Click on Overview tab
      const overviewTab = screen.getByRole('button', { name: /overview/i });
      fireEvent.click(overviewTab);

      await waitFor(() => {
        expect(screen.getByText('55.0°C')).toBeInTheDocument();
      });

      expect(screen.getByText('⚠ High')).toBeInTheDocument();
    });
  });

  describe('WebSocket Subscription', () => {
    beforeEach(() => {
      mockSubscribe.mockClear();
      mockUnsubscribe.mockClear();
      mockSubscribe.mockReturnValue('subscription-123');
    });

    it('subscribes to device_status on mount', async () => {
      render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      expect(mockSubscribe).toHaveBeenCalledWith(
        'device_status',
        expect.any(Function),
        expect.any(Function), // onError handler
        { device_id: 'device-1' }
      );
    });

    it('unsubscribes on unmount', async () => {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalledWith('subscription-123');
    });

    it('updates device state when receiving WebSocket update', async () => {
      let capturedHandler: ((data: any) => void) | null = null;
      mockSubscribe.mockImplementation((type, handler, _onError, _filters) => {
        if (type === 'device_status') {
          capturedHandler = handler;
        }
        return 'subscription-123';
      });

      render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      // Click on Overview tab
      const overviewTab = screen.getByRole('button', { name: /overview/i });
      fireEvent.click(overviewTab);

      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
      });

      // Simulate WebSocket update
      act(() => {
        if (capturedHandler) {
          capturedHandler({
            devices: [{
              id: 'device-1',
              battery_level: 92,
              lock_status: 'unlocked',
              signal_strength: -45,
              temperature: 25.0,
            }]
          });
        }
      });

      await waitFor(() => {
        expect(screen.getByText('92%')).toBeInTheDocument(); // Updated battery
      });
    });

    it('ignores WebSocket updates for different devices', async () => {
      let capturedHandler: ((data: any) => void) | null = null;
      mockSubscribe.mockImplementation((type, handler, _onError, _filters) => {
        if (type === 'device_status') {
          capturedHandler = handler;
        }
        return 'subscription-123';
      });

      render(
        <MemoryRouter initialEntries={['/devices/device-1']}>
          <ToastProvider>
            <DeviceDetailsPage />
          </ToastProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Device Details')).toBeInTheDocument();
      });

      // Click on Overview tab
      const overviewTab = screen.getByRole('button', { name: /overview/i });
      fireEvent.click(overviewTab);

      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
      });

      // Simulate WebSocket update for different device
      act(() => {
        if (capturedHandler) {
          capturedHandler({
            devices: [{
              id: 'device-2', // Different device
              battery_level: 50,
            }]
          });
        }
      });

      // Battery should remain unchanged at 85%
      expect(screen.getByText('85%')).toBeInTheDocument();
    });
  });
});

