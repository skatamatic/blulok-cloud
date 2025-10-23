import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BatteryStatusWidget } from '@/components/Widget/BatteryStatusWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { createMockUnit } from '@/__tests__/utils/test-utils';

// Mock the WebSocket context
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  ...jest.requireActual('@/contexts/WebSocketContext'),
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
    connectionStatus: 'connected',
  }),
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock auth context
jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: () => ({
    authState: {
      user: {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'admin' as const,
        facilities: []
      },
      isAuthenticated: true,
    },
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      <DropdownProvider>
        {component}
      </DropdownProvider>
    </ThemeProvider>
  );
};

describe('BatteryStatusWidget Comprehensive Tests', () => {

  const mockUnits = [
    createMockUnit({
      id: 'unit-1',
      unit_number: 'A-101',
      battery_level: 15,
      is_online: true,
      facility_name: 'Test Facility',
      last_seen: new Date().toISOString(),
    }),
    createMockUnit({
      id: 'unit-2',
      unit_number: 'A-102',
      battery_level: 3,
      is_online: true,
      facility_name: 'Test Facility',
      last_seen: new Date().toISOString(),
    }),
    createMockUnit({
      id: 'unit-3',
      unit_number: 'A-103',
      battery_level: 0,
      is_online: false,
      facility_name: 'Test Facility',
      last_seen: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue('test-subscription-id');
  });

  describe('Basic Rendering', () => {
    it('renders with default props', () => {
      renderWithProviders(<BatteryStatusWidget currentSize="medium" onSizeChange={() => {}} />);
      expect(screen.getByText('Battery Status')).toBeInTheDocument();
    });

    it('displays loading state initially', () => {
      renderWithProviders(<BatteryStatusWidget currentSize="medium" onSizeChange={() => {}} />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('subscribes to websocket on mount', () => {
      renderWithProviders(<BatteryStatusWidget currentSize="medium" onSizeChange={() => {}} />);
      expect(mockSubscribe).toHaveBeenCalledWith(
        'battery_status',
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('unsubscribes on unmount', () => {
      const { unmount } = renderWithProviders(<BatteryStatusWidget currentSize="medium" onSizeChange={() => {}} />);
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledWith('test-subscription-id');
    });
  });

  describe('Data Display', () => {
    const mockBatteryData = {
      lowBatteryUnits: [mockUnits[0], mockUnits[1], mockUnits[2]], // Include offline unit
      totalUnits: 10,
      criticalBatteryUnits: 3, // Updated to include offline unit as critical
      lowBatteryCount: 2,
      offlineUnits: 1,
      onlineUnits: 9,
      lastUpdated: new Date().toISOString(),
    };

    it('displays battery statistics correctly', async () => {
      renderWithProviders(<BatteryStatusWidget currentSize="medium" onSizeChange={() => {}} />);

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      const subscribeCall = mockSubscribe.mock.calls[0];
      const dataHandler = subscribeCall[1];

      act(() => {
        dataHandler(mockBatteryData);
      });

      await waitFor(() => {
        expect(screen.getByText('Critical')).toBeInTheDocument();
        expect(screen.getByText('Low')).toBeInTheDocument();
        expect(screen.getByText('Offline')).toBeInTheDocument();
        // Check that the specific counts are displayed
        expect(screen.getByText('3')).toBeInTheDocument(); // Critical count
        expect(screen.getByText('2')).toBeInTheDocument(); // Low count
        expect(screen.getByText('1')).toBeInTheDocument(); // Offline count
      });
    });

    it('shows critical units by default', async () => {
      renderWithProviders(<BatteryStatusWidget currentSize="medium" onSizeChange={() => {}} />);

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      const subscribeCall = mockSubscribe.mock.calls[0];
      const dataHandler = subscribeCall[1];
      dataHandler(mockBatteryData);

      await waitFor(() => {
        expect(screen.getByText('Unit A-102')).toBeInTheDocument(); // Critical unit
        expect(screen.getByText('3%')).toBeInTheDocument(); // Critical battery level
      });
    });

    it('displays facility information', async () => {
      renderWithProviders(<BatteryStatusWidget currentSize="medium" onSizeChange={() => {}} />);

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      const subscribeCall = mockSubscribe.mock.calls[0];
      const dataHandler = subscribeCall[1];
      dataHandler(mockBatteryData);

      await waitFor(() => {
        expect(screen.getByText('Test Facility')).toBeInTheDocument();
      });
    });

    it('shows offline status correctly', async () => {
      renderWithProviders(<BatteryStatusWidget currentSize="medium" onSizeChange={() => {}} />);

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      const subscribeCall = mockSubscribe.mock.calls[0];
      const dataHandler = subscribeCall[1];

      act(() => {
        dataHandler(mockBatteryData);
      });

      await waitFor(() => {
        // The component shows offline count in statistics
        expect(screen.getByText('Offline')).toBeInTheDocument(); // Offline status label
        expect(screen.getByText('1')).toBeInTheDocument(); // Offline count
      });
    });
  });

  describe('Widget Sizing', () => {
    const mockBatteryData = {
      lowBatteryUnits: [mockUnits[0]],
      totalUnits: 10,
      criticalBatteryUnits: 1,
      lowBatteryCount: 0,
      offlineUnits: 0,
      onlineUnits: 10,
      lastUpdated: new Date().toISOString(),
    };

    it('renders in small size', async () => {
      renderWithProviders(<BatteryStatusWidget currentSize="small" onSizeChange={() => {}} />);

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      const subscribeCall = mockSubscribe.mock.calls[0];
      const dataHandler = subscribeCall[1];
      dataHandler(mockBatteryData);

      await waitFor(() => {
        expect(screen.getByText('Battery Status')).toBeInTheDocument();
      });
    });

    it('renders in large size', async () => {
      renderWithProviders(<BatteryStatusWidget currentSize="large" onSizeChange={() => {}} />);

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });

      const subscribeCall = mockSubscribe.mock.calls[0];
      const dataHandler = subscribeCall[1];
      dataHandler(mockBatteryData);

      await waitFor(() => {
        expect(screen.getByText('Battery Status')).toBeInTheDocument();
      });
    });
  });
});
