import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DevicesPage from '@/pages/DevicesPage';
import { apiService } from '@/services/api.service';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { AuthProvider } from '@/contexts/AuthContext';

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
    // Mock WebSocket subscription
    (WebSocketProvider as any).__esModule = true;
    (WebSocketProvider as any).default = ({ children }: any) => children;
  });

  it('should render commands tab for admin users', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <WebSocketProvider>
            <DevicesPage />
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      // The Commands tab should be present in the tab group
      const tabButtons = screen.getAllByRole('button').filter(btn =>
        btn.className.includes('rounded-md') &&
        btn.querySelector('svg') &&
        !btn.textContent?.includes('Filters') &&
        !btn.textContent?.includes('Add Device')
      );
      expect(tabButtons).toHaveLength(3); // Grid, List, Commands tabs
    });

    const tabButtons = screen.getAllByRole('button').filter(btn =>
      btn.className.includes('rounded-md') &&
      btn.querySelector('svg') &&
      !btn.textContent?.includes('Filters') &&
      !btn.textContent?.includes('Add Device')
    );
    const commandsButton = tabButtons[2]; // 3rd tab is Commands
    await act(async () => {
      fireEvent.click(commandsButton);
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
          <WebSocketProvider>
            <DevicesPage initialCommandQueue={mockCommands} />
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    const tabButtons = screen.getAllByRole('button').filter(btn =>
      btn.className.includes('rounded-md') &&
      btn.querySelector('svg') &&
      !btn.textContent?.includes('Filters') &&
      !btn.textContent?.includes('Add Device')
    );
    const commandsButton = tabButtons[2]; // 3rd tab is Commands
    await act(async () => {
      fireEvent.click(commandsButton);
    });

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
          <WebSocketProvider>
            <DevicesPage initialCommandQueue={mockCommands} />
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    const tabButtons = screen.getAllByRole('button').filter(btn =>
      btn.className.includes('rounded-md') &&
      btn.querySelector('svg') &&
      !btn.textContent?.includes('Filters') &&
      !btn.textContent?.includes('Add Device')
    );
    const commandsButton = tabButtons[2]; // 3rd tab is Commands
    await act(async () => {
      fireEvent.click(commandsButton);
    });

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
          <WebSocketProvider>
            <DevicesPage initialCommandQueue={mockCommands} />
          </WebSocketProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    // Commands tab should be active (check by the presence of command action buttons)
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    const tabButtons = screen.getAllByRole('button').filter(btn =>
      btn.className.includes('rounded-md') &&
      btn.querySelector('svg') &&
      !btn.textContent?.includes('Filters') &&
      !btn.textContent?.includes('Add Device')
    );
    const commandsButton = tabButtons[2]; // 3rd tab is Commands
    await act(async () => {
      fireEvent.click(commandsButton);
    });

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
