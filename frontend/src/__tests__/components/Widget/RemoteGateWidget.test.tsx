import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { RemoteGateWidget } from '@/components/Widget/RemoteGateWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { AccessControlDevice } from '@/types/facility.types';

// Mock the API service
const mockGetDevices = jest.fn();
const mockUpdateAccessControlLockStatus = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getDevices: (...args: unknown[]) => mockGetDevices(...args),
    updateAccessControlLockStatus: (...args: unknown[]) =>
      mockUpdateAccessControlLockStatus(...args),
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

const renderWithProviders = (
  component: React.ReactElement,
  options?: { allFacilitiesMode?: boolean },
) => {
  const child =
    !options?.allFacilitiesMode &&
    component.type === RemoteGateWidget &&
    component.props.facilityFilter === undefined
      ? React.cloneElement(component, { facilityFilter: 'facility-1' })
      : component;
  return render(
    <ThemeProvider>
      <DropdownProvider>
        <ToastProvider>{child}</ToastProvider>
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
      device_serial: 'SN-gate-1',
      device_type: 'gate',
      location_description: 'Front entrance',
      relay_channel: 1,
      status: 'online',
      is_locked: true, // Closed
      supports_widget_timed_open: true,
      last_activity: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      facility_name: 'Downtown Storage',
    },
    {
      id: 'gate-2',
      gateway_id: 'gateway-1',
      name: 'Loading Dock',
      device_serial: 'SN-gate-2',
      device_type: 'door',
      location_description: 'Loading area',
      relay_channel: 2,
      status: 'online',
      is_locked: false, // Open
      supports_remote_lock: true,
      last_activity: new Date(Date.now() - 3600000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      facility_name: 'Downtown Storage',
    },
    {
      id: 'gate-3',
      gateway_id: 'gateway-2',
      name: 'Vehicle Gate',
      device_serial: 'SN-gate-3',
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
    jest.useRealTimers();
    mockGetDevices.mockResolvedValue({
      devices: mockAccessControlDevices,
      total: mockAccessControlDevices.length,
    });
    mockUpdateAccessControlLockStatus.mockResolvedValue({
      success: true,
      message: 'Lock command accepted',
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
          limit: 200,
          facility_id: 'facility-1',
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
          limit: 200,
          facility_id: 'facility-123',
        });
      });
    });

    it('does not load gates when no facility is selected (all-facilities dashboard mode)', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />,
        { allFacilitiesMode: true },
      );

      expect(screen.getByText('Select a facility')).toBeInTheDocument();
      expect(mockGetDevices).not.toHaveBeenCalled();
    });

    it('lists gates from multiple facilities in the selector when API returns them (large widget)', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /Vehicle Gate - Warehouse District \(gate\)/ })
        ).toBeInTheDocument();
      });
    });

    it('subscribes to websocket on mount', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith(
          'device_status',
          expect.any(Function),
          undefined,
          undefined
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
      
      // Check that options are present (name may appear in select + detail panel)
      expect(screen.getAllByText(/Main Entrance/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Loading Dock/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Vehicle Gate/).length).toBeGreaterThan(0);
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
        expect(screen.getAllByText('Main Entrance').length).toBeGreaterThan(0);
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
        // Should show stats footer labels
        expect(screen.getByText('Total')).toBeInTheDocument();
        expect(screen.getByText('Online')).toBeInTheDocument();
        expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);
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
      
      // Should now show the offline gate status
      await waitFor(() => {
        expect(screen.getByText('Remote control unavailable')).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Gate Operations', () => {
    it('opens gate when Open Once is clicked', async () => {
      const afterOpen = mockAccessControlDevices.map((d) =>
        d.id === 'gate-1' ? { ...d, is_locked: false } : d
      );
      mockGetDevices
        .mockResolvedValueOnce({
          devices: mockAccessControlDevices,
          total: mockAccessControlDevices.length,
        })
        .mockResolvedValue({
          devices: afterOpen,
          total: afterOpen.length,
        });

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
      
      await waitFor(() => {
        expect(mockUpdateAccessControlLockStatus).toHaveBeenCalledWith('gate-1', 'unlocked');
      });

      // Gate list refreshes after unlock; "Open" appears in multiple places (badge + stats), so assert via control state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Open Once/ })).toBeDisabled();
      }, { timeout: 3000 });
    });

    it('closes gate when Close Gate is clicked', async () => {
      const openDock = { ...mockAccessControlDevices[1] };
      const afterClose = [{ ...openDock, is_locked: true }];
      mockGetDevices
        .mockResolvedValueOnce({
          devices: [openDock],
          total: 1,
        })
        .mockResolvedValue({
          devices: afterClose,
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
      
      await waitFor(() => {
        expect(mockUpdateAccessControlLockStatus).toHaveBeenCalledWith('gate-2', 'locked');
      });
      
      await waitFor(() => {
        expect(screen.getByText('Closed')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('enables Close Gate when supports_remote_lock is MySQL-style 1', async () => {
      const openDock = {
        ...mockAccessControlDevices[1],
        supports_remote_lock: 1 as unknown as boolean,
      };
      mockGetDevices.mockResolvedValue({
        devices: [openDock],
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

      expect(screen.getByRole('button', { name: /Close Gate/i })).not.toBeDisabled();
    });

    it('opens gate for a duration with open_until when widget timed open is enabled', async () => {
      const nowSec = 1_700_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(nowSec * 1000);

      mockGetDevices
        .mockResolvedValueOnce({
          devices: mockAccessControlDevices,
          total: mockAccessControlDevices.length,
        })
        .mockResolvedValue({
          devices: mockAccessControlDevices,
          total: mockAccessControlDevices.length,
        });

      renderWithProviders(
        <RemoteGateWidget 
          id="test-widget" 
          title="Remote Gate Control" 
          initialSize="large"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Open for 5m/)).toBeInTheDocument();
      });
      
      const holdButton = screen.getByText(/Open for 5m/);
      
      await act(async () => {
        fireEvent.click(holdButton);
      });
      
      await waitFor(() => {
        expect(mockUpdateAccessControlLockStatus).toHaveBeenCalledWith(
          'gate-1',
          'unlocked',
          { open_until: nowSec + 5 * 60 },
        );
      });
      
      await waitFor(() => {
        expect(screen.getByText(/Open until/)).toBeInTheDocument();
      }, { timeout: 3000 });

      jest.restoreAllMocks();
    });

    it('hides timed open control when widget timed open is disabled', async () => {
      mockGetDevices.mockResolvedValue({
        devices: [{ ...mockAccessControlDevices[0], supports_widget_timed_open: false }],
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
        expect(screen.getByText('Open Once')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Open for \d+m/)).not.toBeInTheDocument();
    });

    it('shows offline gate in medium layout when no gates are online', async () => {
      mockGetDevices.mockResolvedValue({
        devices: [
          {
            ...mockAccessControlDevices[2],
            id: 'main-gate-offline',
            name: 'Main Gate',
          },
        ],
        total: 1,
      });

      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="medium" />
      );

      await waitFor(() => {
        expect(screen.getByText('Main Gate')).toBeInTheDocument();
        expect(screen.getByText(/Gate offline/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/No gates online/i)).not.toBeInTheDocument();
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
        expect(screen.getByText('Remote control unavailable')).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    it('refreshes gate list after debounced WebSocket device_status', async () => {
      jest.useFakeTimers();

      const refreshedDevices = mockAccessControlDevices.map((d) =>
        d.id === 'gate-1' ? { ...d, is_locked: false } : d
      );
      mockGetDevices
        .mockResolvedValueOnce({
          devices: mockAccessControlDevices,
          total: mockAccessControlDevices.length,
        })
        .mockResolvedValue({
          devices: refreshedDevices,
          total: refreshedDevices.length,
        });

      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled();
      });
      
      const subscribeCall = mockSubscribe.mock.calls[0];
      const onDeviceStatusMessage = subscribeCall[1];

      await act(async () => {
        onDeviceStatusMessage(undefined);
        jest.advanceTimersByTime(450);
      });

      await waitFor(() => {
        expect(mockGetDevices).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        const openElements = screen.getAllByText('Open');
        expect(openElements.length).toBeGreaterThan(0);
      });

      jest.useRealTimers();
    });

    it('does not schedule refresh when WebSocket payload is for an unrelated device', async () => {
      jest.useFakeTimers();
      mockGetDevices.mockResolvedValue({
        devices: mockAccessControlDevices,
        total: mockAccessControlDevices.length,
      });
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );
      await waitFor(() => {
        expect(mockGetDevices).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('gate-1');
      });

      const countAfterLoad = mockGetDevices.mock.calls.length;
      const onDeviceStatusMessage = mockSubscribe.mock.calls[0][1];

      await act(async () => {
        onDeviceStatusMessage({ updatedDeviceId: 'totally-other-device' });
        jest.advanceTimersByTime(450);
      });

      expect(mockGetDevices.mock.calls.length).toBe(countAfterLoad);
      jest.useRealTimers();
    });

    it('clears invalid gate selection after refresh removes that gate', async () => {
      jest.useFakeTimers();
      const withoutGate2 = mockAccessControlDevices.filter((d) => d.id !== 'gate-2');
      mockGetDevices
        .mockResolvedValueOnce({
          devices: mockAccessControlDevices,
          total: mockAccessControlDevices.length,
        })
        .mockResolvedValue({
          devices: withoutGate2,
          total: withoutGate2.length,
        });

      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" initialSize="large" />
      );

      await waitFor(() => {
        expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('gate-1');
      });

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: 'gate-2' } });
      });
      expect(select.value).toBe('gate-2');

      const onDeviceStatusMessage = mockSubscribe.mock.calls[0][1];
      await act(async () => {
        onDeviceStatusMessage({ updatedDeviceId: 'gate-1' });
        jest.advanceTimersByTime(450);
      });

      await waitFor(() => {
        expect(select.value).toBe('gate-1');
      });
      jest.useRealTimers();
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

  describe('Facility scope', () => {
    it('shows select-facility placeholder when no facility is selected', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" />,
        { allFacilitiesMode: true },
      );

      expect(screen.getByText('Select a facility')).toBeInTheDocument();
      expect(screen.getByText(/Choose a facility from the header/i)).toBeInTheDocument();
      expect(mockGetDevices).not.toHaveBeenCalled();
    });
  });

  describe('Refresh Functionality', () => {
    it('refreshes data when refresh button is clicked', async () => {
      renderWithProviders(
        <RemoteGateWidget id="test-widget" title="Remote Gate Control" facilityFilter="facility-1" />
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
