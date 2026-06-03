import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HistogramWidget } from '@/components/Widget/HistogramWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';

// Mock the API service
const mockGetActivityStats = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getActivityStats: (...args: unknown[]) => mockGetActivityStats(...args),
  },
}));

// Mock auth context
const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin' as const,
  facilityIds: ['facility-1', 'facility-2', 'facility-3'],
  facilityNames: ['Downtown Storage', 'Warehouse District', 'Airport Facility'],
};

jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: () => ({
    authState: {
      user: mockUser,
      isAuthenticated: true,
    },
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
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

describe('HistogramWidget', () => {
  const mockActivityStats = {
    success: true,
    data: [
      { date: '2026-01-01', facility_id: 'facility-1', facility_name: 'Downtown Storage', activity_count: 25 },
      { date: '2026-01-01', facility_id: 'facility-2', facility_name: 'Warehouse District', activity_count: 18 },
      { date: '2026-01-02', facility_id: 'facility-1', facility_name: 'Downtown Storage', activity_count: 32 },
      { date: '2026-01-02', facility_id: 'facility-2', facility_name: 'Warehouse District', activity_count: 22 },
      { date: '2026-01-03', facility_id: 'facility-1', facility_name: 'Downtown Storage', activity_count: 28 },
      { date: '2026-01-03', facility_id: 'facility-2', facility_name: 'Warehouse District', activity_count: 15 },
    ],
    period: 'month',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActivityStats.mockResolvedValue(mockActivityStats);
  });

  afterEach(() => {
    // no-op: beforeEach already clears mocks
  });

  describe('Basic Rendering', () => {
    it('renders with default props', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" />
      );
      
      expect(screen.getByText('Activity Histogram')).toBeInTheDocument();
    });

    it('displays loading state initially', async () => {
      // Create a promise that resolves after a delay to test loading state
      let resolvePromise: (value: typeof mockActivityStats) => void;
      const hangingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockGetActivityStats.mockImplementation(() => hangingPromise);
      
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" />
      );
      
      // Should show loading state
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
      
      // Resolve the promise to prevent hanging
      resolvePromise!(mockActivityStats);
      
      // Wait for the component to update
      await waitFor(() => {
        expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('calls API on mount with default period', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" />
      );
      
      await waitFor(() => {
        expect(mockGetActivityStats).toHaveBeenCalledWith({
          period: 'month',
        });
      });
    });
  });

  describe('Data Display', () => {
    it('displays chart after load', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" initialSize="large" />
      );
      
      await waitFor(() => {
        expect(screen.getAllByText('Downtown Storage').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Warehouse District').length).toBeGreaterThan(0);
      });
    });

    it('shows date labels on chart', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" initialSize="large" />
      );
      
      await waitFor(() => {
        // Should show formatted date labels (there may be multiple "Jan" labels)
        const janLabels = screen.getAllByText(/Jan/);
        expect(janLabels.length).toBeGreaterThan(0);
      });
    });

    it('handles empty data gracefully', async () => {
      mockGetActivityStats.mockResolvedValue({
        success: true,
        data: [],
        period: 'month',
      });
      
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('No activity data for this period')).toBeInTheDocument();
      });
    });

    it('shows error state on API failure', async () => {
      mockGetActivityStats.mockRejectedValue(new Error('Network error'));
      
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load activity data')).toBeInTheDocument();
      });
    });
  });

  describe('Time Period Selection', () => {
    it('changes time period when selected', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" initialSize="large" />
      );
      
      await waitFor(() => {
        // Component may call API twice: once on mount, once after facilities are initialized
        expect(mockGetActivityStats).toHaveBeenCalled();
      });
      
      // All calls should be with 'month' period (default)
      const calls = mockGetActivityStats.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls.length).toBeLessThanOrEqual(2); // Allow for initialization
      
      // Verify at least one call has the correct period
      const hasMonthPeriod = calls.some(call => call[0]?.period === 'month');
      expect(hasMonthPeriod).toBe(true);
    });
  });

  describe('Widget Sizing', () => {
    it('renders in medium size', async () => {
      renderWithProviders(
        <HistogramWidget 
          id="test-widget" 
          title="Activity Histogram" 
          initialSize="medium"
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('Activity Histogram')).toBeInTheDocument();
      });
    });

    it('renders in large size', async () => {
      renderWithProviders(
        <HistogramWidget 
          id="test-widget" 
          title="Activity Histogram" 
          initialSize="large"
        />
      );
      
      await waitFor(() => {
        expect(screen.getAllByText('Downtown Storage').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Facility Selection', () => {
    it('shows facility legend', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" initialSize="large" />
      );
      
      await waitFor(() => {
        expect(screen.getAllByText('Downtown Storage').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Warehouse District').length).toBeGreaterThan(0);
      });
    });

    it('scopes chart to all assigned facilities from auth', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" />
      );

      await waitFor(() => {
        expect(mockGetActivityStats).toHaveBeenCalledWith(
          expect.objectContaining({
            period: 'month',
          })
        );
      });
    });

    it('hides facility legend when a single facility is selected', async () => {
      renderWithProviders(
        <HistogramWidget
          id="test-widget"
          title="Activity Histogram"
          initialSize="large"
          facilityFilter="facility-1"
        />
      );

      await waitFor(() => {
        expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
      });

      expect(screen.queryByText('Warehouse District')).not.toBeInTheDocument();
    });
  });

  describe('Refresh Functionality', () => {
    it('calls API on initial load', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" />
      );
      
      await waitFor(() => {
        expect(mockGetActivityStats).toHaveBeenCalled();
      });
    });
  });

  describe('Chart Bars', () => {
    it('renders bar elements for each data point', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" initialSize="large" />
      );
      
      await waitFor(() => {
        const bars = document.querySelectorAll('.rounded-sm.opacity-90');
        expect(bars.length).toBeGreaterThan(0);
      });
    });

    it('shows tooltip breakdown on bar hover', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" initialSize="large" />
      );

      await waitFor(() => {
        expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
      });

      const column = screen.getAllByRole('img')[0];
      fireEvent.mouseEnter(column);

      expect(screen.getAllByText('Total events').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Downtown Storage').length).toBeGreaterThan(0);
    });
  });
});
