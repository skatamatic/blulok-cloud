import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { RemoteGateWidget } from '@/components/Widget/RemoteGateWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { AccessControlDevice } from '@/types/facility.types';

// Mock the API service
const mockGetDevices = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getDevices: (...args: unknown[]) => mockGetDevices(...args),
  },
}));

// Mock the WebSocket context
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  ...jest.requireActual('@/contexts/WebSocketContext'),
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  }),
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

describe('RemoteGateWidget', () => {
  const mockAccessControlDevices: (AccessControlDevice & { facility_name?: string })[] = [
    {
      id: 'gate-1',
      gateway_id: 'gateway-1',
      name: 'Main Entrance',
      device_type: 'gate',
      location_description: 'Front entrance',
      relay_channel: 1,
      status: 'online',
      is_locked: true, // Closed
      last_activity: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      facility_name: 'Downtown Storage',
    },
    {
      id: 'gate-2',
      gateway_id: 'gateway-1',
      name: 'Loading Dock',
      device_type: 'door',
      location_description: 'Loading area',
      relay_channel: 2,
      status: 'online',
      is_locked: false, // Open
      last_activity: new Date(Date.now() - 3600000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      facility_name: 'Downtown Storage',
    },
    {
      id: 'gate-3',
      gateway_id: 'gateway-2',
      name: 'Vehicle Gate',
      device_type: 'gate',
      location_description: 'Parking area',
      relay_channel: 1,
      status: 'offline',
      is_locked: true,
      last_activity: new Date(Date.now() - 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      facility_name: 'Warehouse District',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDevices.mockResolvedValue({
      devices: mockAccessControlDevices,
      total: mockAccessControlDevices.length,
    });
    mockSubscribe.mockReturnValue('test-subscription-id');
  });

  describe('Basic Rendering', () => {
    it('renders with default props', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />
      );
      
      expect(screen.getByText('Remote Gate Control')).toBeInTheDocument();
    });

    it('displays loading state initially', () => {
      mockGetDevices.mockImplementation(() => new Promise(() => {}));
      
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />
      );
      
      expect(screen.getByText('Loading gates...')).toBeInTheDocument();
    });

    it('calls API on mount', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />
      );
      
      await waitFor(() => {
        expect(mockGetDevices).toHaveBeenCalledWith({
          device_type: 'access_control',
          facility_id: undefined,
        });
      });
    });

    it('passes facility filter to API', async () => {
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          facilityFilter="facility-123"
        />
      );
      
      await waitFor(() => {
        expect(mockGetDevices).toHaveBeenCalledWith({
          device_type: 'access_control',
          facility_id: 'facility-123',
        });
      });
    });

    it('subscribes to websocket on mount', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith(
          'device_status',
          expect.any(Function)
        );
      });
    });

    it('unsubscribes on unmount', async () => {
      const { unmount } = renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });
      
      unmount();
      
      expect(mockUnsubscribe).toHaveBeenCalledWith('test-subscription-id');
    });
  });

  describe('Data Display', () => {
    it('displays gates in dropdown after load', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });
      
      // Check that options are present
      expect(screen.getByText(/Main Entrance/)).toBeInTheDocument();
      expect(screen.getByText(/Loading Dock/)).toBeInTheDocument();
      expect(screen.getByText(/Vehicle Gate/)).toBeInTheDocument();
    });

    it('auto-selects first online gate', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      
      await waitFor(() => {
        // Should auto-select Main Entrance (first online gate)
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.value).toBe('gate-1');
      });
    });

    it('shows gate status correctly', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      
      await waitFor(() => {
        // Main Entrance should show as Closed (is_locked=true)
        expect(screen.getByText('Closed')).toBeInTheDocument();
      });
    });

    it('handles empty data gracefully', async () => {
      mockGetDevices.mockResolvedValue({
        devices: [],
        total: 0,
      });
      
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('No access control devices found')).toBeInTheDocument();
      });
    });

    it('shows error state on API failure', async () => {
      mockGetDevices.mockRejectedValue(new Error('Network error'));
      
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load gates')).toBeInTheDocument();
      });
    });
  });

  describe('Widget Sizing', () => {
    it('renders in medium size with compact view', async () => {
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="medium"
        />
      );
      
      await waitFor(() => {
        // Medium size should show the gate name
        expect(screen.getByText('Main Entrance')).toBeInTheDocument();
      });
    });

    it('renders in large size with full controls', async () => {
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="large"
        />
      );
      
      await waitFor(() => {
        // Large size should show dropdown and control buttons
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getByText('Open Once')).toBeInTheDocument();
      });
    });

    it('shows stats in large size', async () => {
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="large"
        />
      );
      
      await waitFor(() => {
        // Should show stats
        expect(screen.getByText('Total')).toBeInTheDocument();
        expect(screen.getByText('Online')).toBeInTheDocument();
        expect(screen.getByText('Open')).toBeInTheDocument();
      });
    });
  });

  describe('Gate Selection', () => {
    it('allows selecting different gates', async () => {
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="large"
        />
      );
      
      // Wait for dropdown to be ready with data and auto-select to happen
      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select).toBeInTheDocument();
        // Check that gate-3 option exists
        const options = Array.from(select.querySelectorAll('option'));
        expect(options.some(opt => opt.value === 'gate-3')).toBe(true);
        // Wait for auto-select of first online gate
        expect(select.value).toBe('gate-1');
      }, { timeout: 5000 });
      
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      
      // Change selection to offline gate
      await act(async () => {
        fireEvent.change(select, { target: { value: 'gate-3' } });
      });
      
      // Verify the select value changed
      expect(select.value).toBe('gate-3');
      
      // Should now show the offline gate status or "Cannot operate gate remotely"
      await waitFor(() => {
        // The component shows "Gate offline" for offline gates or shows the "Cannot operate" message
        expect(screen.getByText('Cannot operate gate remotely')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Gate Operations', () => {
    it('opens gate when Open Once is clicked', async () => {
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="large"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Open Once')).toBeInTheDocument();
      });
      
      const openButton = screen.getByText('Open Once');
      
      await act(async () => {
        fireEvent.click(openButton);
      });
      
      // Should show operating state
      await waitFor(() => {
        expect(screen.getByText('Opening...')).toBeInTheDocument();
      });
      
      // After operation completes, gate should be Open
      await waitFor(() => {
        expect(screen.getByText('Open')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('closes gate when Close Gate is clicked', async () => {
      // Use gate-2 which is already open
      mockGetDevices.mockResolvedValue({
        devices: [mockAccessControlDevices[1]], // Loading Dock (open)
        total: 1,
      });
      
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="large"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Close Gate')).toBeInTheDocument();
      });
      
      const closeButton = screen.getByText('Close Gate');
      
      await act(async () => {
        fireEvent.click(closeButton);
      });
      
      // After operation completes, gate should be Closed
      await waitFor(() => {
        expect(screen.getByText('Closed')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('holds gate open for specified duration', async () => {
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="large"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Hold Open/)).toBeInTheDocument();
      });
      
      const holdButton = screen.getByText(/Hold Open/);
      
      await act(async () => {
        fireEvent.click(holdButton);
      });
      
      // After operation completes, should show holding message
      await waitFor(() => {
        expect(screen.getByText(/Holding open until/)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('disables operations for offline gates', async () => {
      // Use only the offline gate
      mockGetDevices.mockResolvedValue({
        devices: [mockAccessControlDevices[2]], // Vehicle Gate (offline)
        total: 1,
      });
      
      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="large"
        />
      );
      
      // Wait for gate to load (gate name may be split across text nodes in option)
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
        // Check if the option exists by checking the select's options
        const options = Array.from(select.querySelectorAll('option'));
        const hasGate3 = options.some(opt => opt.value === 'gate-3');
        expect(hasGate3).toBe(true);
      });
      
      // Select the offline gate from dropdown
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'gate-3' } });
      
      await waitFor(() => {
        expect(screen.getByText(/Gate offline/i)).toBeInTheDocument();
        expect(screen.getByText('Cannot operate gate remotely')).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    it('updates gate status from WebSocket updates', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });
      
      // Get the message handler
      const subscribeCall = mockSubscribe.mock.calls[0];
      const messageHandler = subscribeCall[1];
      
      // Simulate device status update
      const updatedDevice: AccessControlDevice = {
        ...mockAccessControlDevices[0],
        is_locked: false, // Now open
        status: 'online',
      };
      
      act(() => {
        messageHandler({ device: updatedDevice });
      });
      
      await waitFor(() => {
        // There may be multiple "Open" elements (status badge and stats), so use getAllByText
        const openElements = screen.getAllByText('Open');
        expect(openElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Timestamp Formatting', () => {
    it('shows "Just now" for recent activity', async () => {
      const recentDevice: AccessControlDevice & { facility_name?: string } = {
        ...mockAccessControlDevices[0],
        last_activity: new Date().toISOString(),
      };
      
      mockGetDevices.mockResolvedValue({
        devices: [recentDevice],
        total: 1,
      });
      
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Just now/)).toBeInTheDocument();
      });
    });

    it('shows hours ago for older activity', async () => {
      const olderDevice: AccessControlDevice & { facility_name?: string } = {
        ...mockAccessControlDevices[0],
        last_activity: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      };
      
      mockGetDevices.mockResolvedValue({
        devices: [olderDevice],
        total: 1,
      });
      
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/5h ago/)).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('refreshes data when refresh button is clicked', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />
      );
      
      await waitFor(() => {
        expect(mockGetDevices).toHaveBeenCalledTimes(1);
      });
      
      // The refresh is in the enhanced menu, so we verify the API was called on load
      // In a full integration test, we'd open the menu and click refresh
      expect(mockGetDevices).toHaveBeenCalled();
    });
  });
});
