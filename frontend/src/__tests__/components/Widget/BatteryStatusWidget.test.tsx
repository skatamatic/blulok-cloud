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

// Mock auth context to match what the component expects
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

describe('BatteryStatusWidget', () => {
  const mockProps = {
    currentSize: 'medium' as const,
    onSizeChange: jest.fn(),
    onRemove: jest.fn(),
  };

  const mockBatteryData = {
    lowBatteryUnits: [
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
        battery_level: 2, // Make it critical so it shows up
        is_online: false,
        facility_name: 'Test Facility',
        last_seen: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    ],
    totalUnits: 10,
    criticalBatteryUnits: 3, // Updated to include offline unit as critical
    lowBatteryCount: 1,
    offlineUnits: 1,
    onlineUnits: 9,
    lastUpdated: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue('test-subscription-id');
  });

  it('renders loading state initially', () => {
    renderWithProviders(<BatteryStatusWidget {...mockProps} />);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('subscribes to battery_status websocket on mount', () => {
    renderWithProviders(<BatteryStatusWidget {...mockProps} />);
    
    expect(mockSubscribe).toHaveBeenCalledWith(
      'battery_status',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('unsubscribes from websocket on unmount', () => {
    const { unmount } = renderWithProviders(<BatteryStatusWidget {...mockProps} />);
    
    unmount();
    
    expect(mockUnsubscribe).toHaveBeenCalledWith('test-subscription-id');
  });

  it('displays battery data when received', async () => {
    renderWithProviders(<BatteryStatusWidget {...mockProps} />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    // Simulate receiving battery data
    const subscribeCall = mockSubscribe.mock.calls[0];
    const dataHandler = subscribeCall[1];

    act(() => {
      dataHandler(mockBatteryData);
    });

    await waitFor(() => {
      expect(screen.getByText('Battery Status')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Offline')).toBeInTheDocument();
      // Check specific counts to avoid ambiguity
      expect(screen.getByText('3')).toBeInTheDocument(); // Critical count
      expect(screen.getAllByText('1')).toHaveLength(2); // Low and offline counts
    });
  });

  it('shows critical units by default', async () => {
    renderWithProviders(<BatteryStatusWidget {...mockProps} />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    const subscribeCall = mockSubscribe.mock.calls[0];
    const dataHandler = subscribeCall[1];

    act(() => {
      dataHandler(mockBatteryData);
    });

    await waitFor(() => {
      // Default filter is 'critical', so only critical units should be shown
      // The component shows critical units sorted by battery level (lowest first)
      expect(screen.getByText('Unit A-102')).toBeInTheDocument(); // Critical unit (3%)
      expect(screen.getByText('3%')).toBeInTheDocument(); // Critical battery level
    });
  });

  it('shows battery levels correctly', async () => {
    renderWithProviders(<BatteryStatusWidget {...mockProps} />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    const subscribeCall = mockSubscribe.mock.calls[0];
    const dataHandler = subscribeCall[1];

    act(() => {
      dataHandler(mockBatteryData);
    });

    await waitFor(() => {
      // Only critical units are shown by default with their battery levels
      expect(screen.getByText('3%')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });

  it('displays units with correct battery levels', async () => {
    renderWithProviders(<BatteryStatusWidget {...mockProps} />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    const subscribeCall = mockSubscribe.mock.calls[0];
    const dataHandler = subscribeCall[1];

    act(() => {
      dataHandler(mockBatteryData);
    });

    await waitFor(() => {
      // Check that battery levels are displayed correctly for visible units
      expect(screen.getByText('3%')).toBeInTheDocument(); // Critical battery (visible by default)
      expect(screen.getByText('Unit A-102')).toBeInTheDocument();
    });
  });

  it('shows no critical alerts message when no critical issues', async () => {
    const emptyBatteryData = {
      ...mockBatteryData,
      lowBatteryUnits: [],
      criticalBatteryUnits: 0,
      lowBatteryCount: 0,
      offlineUnits: 0,
    };

    renderWithProviders(<BatteryStatusWidget {...mockProps} />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    const subscribeCall = mockSubscribe.mock.calls[0];
    const dataHandler = subscribeCall[1];

    act(() => {
      dataHandler(emptyBatteryData);
    });

    await waitFor(() => {
      // Default filter is 'critical', so it should show "No critical battery alerts"
      expect(screen.getByText('No critical battery alerts')).toBeInTheDocument();
    });
  });

  it('displays last updated timestamp', async () => {
    renderWithProviders(<BatteryStatusWidget {...mockProps} />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    const subscribeCall = mockSubscribe.mock.calls[0];
    const dataHandler = subscribeCall[1];

    act(() => {
      dataHandler(mockBatteryData);
    });

    await waitFor(() => {
      // The text shows "Updated Just now" so we look for "Updated"
      expect(screen.getByText(/Updated/)).toBeInTheDocument();
    });
  });
});
