import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ActivityMonitorWidget } from '@/components/Widget/ActivityMonitorWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import { AccessLog } from '@/types/access-history.types';

// Mock the API service
const mockGetAccessHistory = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getAccessHistory: (...args: unknown[]) => mockGetAccessHistory(...args),
  },
}));

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: jest.fn(() => 'activity-subscription'),
    unsubscribe: jest.fn(),
    isConnected: true,
  }),
}));

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
  },
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

describe('ActivityMonitorWidget', () => {
  const mockAccessLogs: AccessLog[] = [
    {
      id: 'log-1',
      device_id: 'device-1',
      device_type: 'blulok',
      facility_id: 'facility-1',
      unit_id: 'unit-1',
      user_id: 'user-1',
      action: 'unlock',
      method: 'app',
      success: true,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      facility_name: 'Test Facility',
      unit_number: 'A-101',
      user_name: 'John Smith',
    },
    {
      id: 'log-2',
      device_id: 'device-2',
      device_type: 'blulok',
      facility_id: 'facility-1',
      unit_id: 'unit-2',
      user_id: 'user-2',
      action: 'lock',
      method: 'app',
      success: true,
      occurred_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      facility_name: 'Test Facility',
      unit_number: 'B-202',
      user_name: 'Jane Doe',
    },
    {
      id: 'log-3',
      device_id: 'device-3',
      device_type: 'blulok',
      facility_id: 'facility-1',
      unit_id: 'unit-3',
      user_id: 'user-3',
      action: 'access_denied',
      method: 'keypad',
      success: false,
      denial_reason: 'invalid_credential',
      occurred_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      facility_name: 'Test Facility',
      unit_number: 'C-303',
      user_name: 'Unknown User',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessHistory.mockResolvedValue({
      success: true,
      logs: mockAccessLogs,
      total: mockAccessLogs.length,
    });
  });

  describe('Basic Rendering', () => {
    it('renders with default props', async () => {
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      expect(screen.getByText('Activity Monitor')).toBeInTheDocument();
    });

    it('displays loading state initially', () => {
      // Make the API call hang to see loading state
      mockGetAccessHistory.mockImplementation(() => new Promise(() => {}));
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      // Should show loading skeleton
      const loadingElements = document.querySelectorAll('.animate-pulse');
      expect(loadingElements.length).toBeGreaterThan(0);
    });

    it('calls API on mount', async () => {
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(mockGetAccessHistory).toHaveBeenCalledWith({
          facility_id: undefined,
          limit: 50,
          offset: 0,
        });
      });
    });

    it('passes facility filter to API', async () => {
      renderWithProviders(
        <ActivityMonitorWidget 
          id="test-widget" 
          title="Activity Monitor" 
          facilityFilter="facility-123"
        />
      );
      
      await waitFor(() => {
        expect(mockGetAccessHistory).toHaveBeenCalledWith({
          facility_id: 'facility-123',
          limit: 50,
          offset: 0,
        });
      });
    });
  });

  describe('Data Display', () => {
    it('displays activity entries after load', async () => {
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Unit A-101 unlocked by John Smith/)).toBeInTheDocument();
      });
      
      expect(screen.getByText(/Unit B-202 locked by Jane Doe/)).toBeInTheDocument();
    });

    it('displays facility information', async () => {
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" initialSize="large" />
      );
      
      await waitFor(() => {
        // Facility should be shown in activity entries (may include bullet point)
        const facilityLabels = screen.getAllByText(/Test Facility/);
        expect(facilityLabels.length).toBeGreaterThan(0);
      });
    });

    it('transforms access_denied correctly', async () => {
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        // Placeholder "Unknown User" is omitted; denial reason is appended instead.
        expect(screen.getByText(/Unlock attempt denied at C-303 — Invalid credential/)).toBeInTheDocument();
      });
    });

    it('handles empty data gracefully', async () => {
      mockGetAccessHistory.mockResolvedValue({
        success: true,
        logs: [],
        total: 0,
      });
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('No recent activity')).toBeInTheDocument();
      });
    });

    it('shows error state on API failure', async () => {
      mockGetAccessHistory.mockRejectedValue(new Error('Network error'));
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load activity data')).toBeInTheDocument();
      });
    });
  });

  describe('Widget Sizing', () => {
    it('renders in small size', async () => {
      renderWithProviders(
        <ActivityMonitorWidget 
          id="test-widget" 
          title="Activity Monitor" 
          initialSize="small"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Unit A-101 unlocked/)).toBeInTheDocument();
      });
    });

    it('renders in medium size', async () => {
      renderWithProviders(
        <ActivityMonitorWidget 
          id="test-widget" 
          title="Activity Monitor" 
          initialSize="medium"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Unit A-101 unlocked/)).toBeInTheDocument();
      });
    });

    it('renders in wide size with filter tabs', async () => {
      renderWithProviders(
        <ActivityMonitorWidget 
          id="test-widget" 
          title="Activity Monitor" 
          initialSize="huge-wide"
        />
      );
      
      await waitFor(() => {
        // Large widgets should show filter tabs
        expect(screen.getByRole('button', { name: /All \(\d+\)/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Alerts \(\d+\)/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Access \(\d+\)/ })).toBeInTheDocument();
      });
    });

  });

  describe('Filtering', () => {
    it('filters to show alerts only', async () => {
      renderWithProviders(
        <ActivityMonitorWidget 
          id="test-widget" 
          title="Activity Monitor" 
          initialSize="huge-wide"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Unit A-101 unlocked/)).toBeInTheDocument();
      });
      
      // Click on Alerts filter
      const alertsButton = screen.getByRole('button', { name: /Alerts \(\d+\)/ });
      fireEvent.click(alertsButton);
      
      // Should only show the failed access attempt
      await waitFor(() => {
        expect(screen.getByText(/Unlock attempt denied at C-303/)).toBeInTheDocument();
      });
      
      // Successful unlock should not be visible
      expect(screen.queryByText(/Unit A-101 unlocked/)).not.toBeInTheDocument();
    });

    it('filters to show access events only', async () => {
      renderWithProviders(
        <ActivityMonitorWidget 
          id="test-widget" 
          title="Activity Monitor" 
          initialSize="huge-wide"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Unit A-101 unlocked/)).toBeInTheDocument();
      });
      
      // Click on Access filter
      const accessButton = screen.getByRole('button', { name: /Access \(\d+\)/ });
      fireEvent.click(accessButton);
      
      // Should show lock/unlock events
      await waitFor(() => {
        expect(screen.getByText(/Unit A-101 unlocked/)).toBeInTheDocument();
        expect(screen.getByText(/Unit B-202 locked/)).toBeInTheDocument();
      });
    });

    it('shows all activities when All filter is selected', async () => {
      renderWithProviders(
        <ActivityMonitorWidget 
          id="test-widget" 
          title="Activity Monitor" 
          initialSize="huge-wide"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Unit A-101 unlocked/)).toBeInTheDocument();
      });
      
      // Click Alerts first
      fireEvent.click(screen.getByRole('button', { name: /Alerts \(\d+\)/ }));
      
      await waitFor(() => {
        expect(screen.queryByText(/Unit A-101 unlocked/)).not.toBeInTheDocument();
      });
      
      // Then click All to restore
      fireEvent.click(screen.getByRole('button', { name: /All \(\d+\)/ }));
      
      await waitFor(() => {
        expect(screen.getByText(/Unit A-101 unlocked/)).toBeInTheDocument();
      });
    });
  });

  describe('Timestamp Formatting', () => {
    it('shows "Just now" for recent activities', async () => {
      const recentLog: AccessLog = {
        ...mockAccessLogs[0],
        occurred_at: new Date().toISOString(),
      };
      
      mockGetAccessHistory.mockResolvedValue({
        success: true,
        logs: [recentLog],
        total: 1,
      });
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Just now')).toBeInTheDocument();
      });
    });

    it('shows minutes ago for older activities', async () => {
      const log: AccessLog = {
        ...mockAccessLogs[0],
        occurred_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
      };
      
      mockGetAccessHistory.mockResolvedValue({
        success: true,
        logs: [log],
        total: 1,
      });
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('15m ago')).toBeInTheDocument();
      });
    });

    it('shows hours ago for activities hours old', async () => {
      const log: AccessLog = {
        ...mockAccessLogs[0],
        occurred_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
      };
      
      mockGetAccessHistory.mockResolvedValue({
        success: true,
        logs: [log],
        total: 1,
      });
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('3h ago')).toBeInTheDocument();
      });
    });
  });

  describe('Activity Type Transformation', () => {
    it('transforms lock action correctly', async () => {
      const lockLog: AccessLog = {
        ...mockAccessLogs[0],
        action: 'lock',
        user_name: 'Test User',
        unit_number: 'X-999',
      };
      
      mockGetAccessHistory.mockResolvedValue({
        success: true,
        logs: [lockLog],
        total: 1,
      });
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Unit X-999 locked by Test User/)).toBeInTheDocument();
      });
    });

    it('transforms system_error action correctly', async () => {
      const errorLog: AccessLog = {
        ...mockAccessLogs[0],
        action: 'system_error',
        reason: 'Device offline',
      };
      
      mockGetAccessHistory.mockResolvedValue({
        success: true,
        logs: [errorLog],
        total: 1,
      });
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/System error on A-101: Device offline/)).toBeInTheDocument();
      });
    });

    it('transforms manual_override action correctly', async () => {
      const overrideLog: AccessLog = {
        ...mockAccessLogs[0],
        action: 'manual_override',
      };
      
      mockGetAccessHistory.mockResolvedValue({
        success: true,
        logs: [overrideLog],
        total: 1,
      });
      
      renderWithProviders(
        <ActivityMonitorWidget id="test-widget" title="Activity Monitor" />
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Manual override on A-101 by John Smith/)).toBeInTheDocument();
      });
    });
  });

  describe('Max Entries Limit', () => {
    it('respects maxEntries prop', async () => {
      renderWithProviders(
        <ActivityMonitorWidget 
          id="test-widget" 
          title="Activity Monitor" 
          maxEntries={10}
        />
      );
      
      await waitFor(() => {
        expect(mockGetAccessHistory).toHaveBeenCalledWith({
          facility_id: undefined,
          limit: 10,
          offset: 0,
        });
      });
    });
  });
});
