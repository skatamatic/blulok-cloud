import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DevicesPage from '@/pages/DevicesPage';
import { apiService } from '@/services/api.service';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { GlobalFacilityProvider } from '@/contexts/GlobalFacilityContext';

jest.mock('@/services/api.service');
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    addToast: jest.fn(),
    removeToast: jest.fn(),
    clearAllToasts: jest.fn(),
    toasts: [],
  }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: () => ({
    authState: {
      user: { id: 'admin-id', email: 'admin@example.com', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
    },
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));
jest.mock('@/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useWebSocket: () => ({
    subscribe: jest.fn(() => () => {}),
    unsubscribe: jest.fn(),
    isConnected: true,
  }),
}));
jest.mock('@/contexts/GlobalFacilityContext', () => ({
  GlobalFacilityProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useGlobalFacility: () => ({
    facilities: [],
    selectedFacilityId: null,
    selectedFacility: null,
    setSelectedFacilityId: jest.fn(),
    isLoading: false,
    hasMultipleFacilities: false,
    isAllFacilitiesSelected: false,
    refresh: jest.fn(),
  }),
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;

describe('DevicesPage - Commands Tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiService.getDevices.mockResolvedValue({
      devices: [],
      total: 0,
    });
    mockApiService.getCommandQueue.mockResolvedValue({
      items: [],
      total: 0,
    });
  });

  it('should render commands tab for admin users', async () => {
    const initialQueue = { items: [], total: 0 };
    render(
      <BrowserRouter>
        <AuthProvider>
          <GlobalFacilityProvider>
            <WebSocketProvider>
              <DevicesPage initialCommandQueue={initialQueue} />
            </WebSocketProvider>
          </GlobalFacilityProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pending Commands: 0')).toBeInTheDocument();
    });

    expect(mockApiService.getCommandQueue).toHaveBeenCalled();
  });

  it('should display command queue data', async () => {
    const mockCommands = {
      items: [{
        id: 'cmd-1',
        facility_id: 'fac-1',
        device_id: 'dev-1',
        command_type: 'ADD_KEY',
        status: 'pending',
        attempt_count: 0,
        payload: { public_key: 'pk-123' },
      }],
      total: 1,
    };
    mockApiService.getCommandQueue.mockResolvedValue(mockCommands);

    render(
      <BrowserRouter>
        <AuthProvider>
          <GlobalFacilityProvider>
            <WebSocketProvider>
              <DevicesPage initialCommandQueue={mockCommands} />
            </WebSocketProvider>
          </GlobalFacilityProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('fac-1')).toBeInTheDocument();
      expect(screen.getByText('dev-1')).toBeInTheDocument();
      expect(screen.getByText('ADD_KEY')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  it('should handle command actions', async () => {
    const mockCommands = {
      items: [{
        id: 'cmd-1',
        facility_id: 'fac-1',
        device_id: 'dev-1',
        command_type: 'ADD_KEY',
        status: 'failed',
        attempt_count: 1,
        payload: { public_key: 'pk-123' },
      }],
      total: 1,
    };
    mockApiService.getCommandQueue.mockResolvedValue(mockCommands);
    mockApiService.retryCommand.mockResolvedValue({ success: true });

    render(
      <BrowserRouter>
        <AuthProvider>
          <GlobalFacilityProvider>
            <WebSocketProvider>
              <DevicesPage initialCommandQueue={mockCommands} />
            </WebSocketProvider>
          </GlobalFacilityProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);
    });

    expect(mockApiService.retryCommand).toHaveBeenCalledWith('cmd-1');
  });

  it('should handle command queue actions', async () => {
    const mockCommands = {
      items: [{
        id: 'cmd-1',
        facility_id: 'fac-1',
        device_id: 'dev-1',
        command_type: 'ADD_KEY',
        status: 'failed',
        attempt_count: 1,
        payload: { public_key: 'pk-123' },
      }],
      total: 1,
    };
    mockApiService.getCommandQueue.mockResolvedValue(mockCommands);

    render(
      <BrowserRouter>
        <AuthProvider>
          <GlobalFacilityProvider>
            <WebSocketProvider>
              <DevicesPage initialCommandQueue={mockCommands} />
            </WebSocketProvider>
          </GlobalFacilityProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    // Commands tab should be active (check by the presence of command action buttons)
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    // Test retry functionality
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    expect(mockApiService.retryCommand).toHaveBeenCalledWith('cmd-1');

    // Test cancel functionality
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    expect(mockApiService.cancelCommand).toHaveBeenCalledWith('cmd-1');
  });
});
