import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HistogramWidget } from '@/components/Widget/HistogramWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';

const mockGetActivityStats = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getActivityStats: (...args: unknown[]) => mockGetActivityStats(...args),
  },
}));

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'admin' as const,
  facilityIds: ['facility-1', 'facility-2', 'facility-3'],
  facilityNames: ['Downtown Storage', 'Warehouse District', 'Airport Facility'],
};

const mockAuthState = { user: mockUser, isAuthenticated: true };
const mockFacilities = [
  { id: 'facility-1', name: 'Downtown Storage' },
  { id: 'facility-2', name: 'Warehouse District' },
  { id: 'facility-3', name: 'Airport Facility' },
] as const;
const mockGlobalFacilityState = {
  facilities: mockFacilities,
  selectedFacilityId: '__ALL_FACILITIES__',
  isAllFacilitiesSelected: true,
};

jest.mock('@/contexts/AuthContext', () => ({
  ...jest.requireActual('@/contexts/AuthContext'),
  useAuth: () => ({
    authState: mockAuthState,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ...jest.requireActual('@/contexts/GlobalFacilityContext'),
  useGlobalFacility: () => mockGlobalFacilityState,
}));

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: jest.fn(() => 'sub-1'),
    unsubscribe: jest.fn(),
    isConnected: false,
  }),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

const renderWithProviders = (component: React.ReactElement) =>
  render(
    <ThemeProvider>
      <DropdownProvider>{component}</DropdownProvider>
    </ThemeProvider>,
  );

function statsRow(
  date: string,
  facilityId: string,
  facilityName: string,
  activityType: string,
  activityCount: number,
) {
  return {
    date,
    facility_id: facilityId,
    facility_name: facilityName,
    activity_type: activityType,
    activity_count: activityCount,
  };
}

function recentDay(daysAgo: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('HistogramWidget', () => {
  const day1 = recentDay(2);
  const day2 = recentDay(1);
  const day3 = recentDay(0);

  const mockActivityStats = {
    success: true,
    data: [
      statsRow(day1, 'facility-1', 'Downtown Storage', 'unlock', 15),
      statsRow(day1, 'facility-1', 'Downtown Storage', 'lock', 10),
      statsRow(day1, 'facility-2', 'Warehouse District', 'unlock', 12),
      statsRow(day1, 'facility-2', 'Warehouse District', 'access_attempt', 6),
      statsRow(day2, 'facility-1', 'Downtown Storage', 'unlock', 20),
      statsRow(day2, 'facility-1', 'Downtown Storage', 'lock', 12),
      statsRow(day2, 'facility-2', 'Warehouse District', 'lock', 22),
      statsRow(day3, 'facility-1', 'Downtown Storage', 'unlock', 18),
      statsRow(day3, 'facility-1', 'Downtown Storage', 'lock', 10),
      statsRow(day3, 'facility-2', 'Warehouse District', 'unlock', 15),
    ],
    period: 'month',
    endDate: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActivityStats.mockResolvedValue(mockActivityStats);
  });

  describe('Basic Rendering', () => {
    it('renders with default props', async () => {
      renderWithProviders(<HistogramWidget id="test-widget" title="Activity Histogram" />);
      expect(screen.getByText('Activity Histogram')).toBeInTheDocument();
    });

    it('calls API on mount with default period', async () => {
      renderWithProviders(<HistogramWidget id="test-widget" title="Activity Histogram" />);

      await waitFor(() => {
        expect(mockGetActivityStats).toHaveBeenCalledWith(
          expect.objectContaining({
            period: 'month',
          }),
        );
      });
    });
  });

  describe('Data Display', () => {
    it('displays chart after load', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" initialSize="large" />,
      );

      await waitFor(() => {
        expect(screen.getAllByText('Downtown Storage').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Warehouse District').length).toBeGreaterThan(0);
      });
    });

    it('shows event-type breakdown in tooltip for multi-facility mode', async () => {
      renderWithProviders(
        <HistogramWidget id="test-widget" title="Activity Histogram" initialSize="large" />,
      );

      await waitFor(() => expect(screen.getAllByRole('img').length).toBeGreaterThan(0));

      fireEvent.mouseEnter(screen.getAllByRole('img').at(-1)!);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toBeInTheDocument();
        expect(tooltip).toHaveTextContent('Unlock');
        expect(tooltip).toHaveTextContent('Downtown Storage');
        expect(tooltip).toHaveTextContent('Warehouse District');
        expect(tooltip).toHaveTextContent('Total');
      });

      expect(screen.queryByText(/Mon,|January/i)).not.toBeInTheDocument();
    });

    it('hides facility names in tooltip for single-facility mode', async () => {
      renderWithProviders(
        <HistogramWidget
          id="test-widget"
          title="Activity Histogram"
          initialSize="large"
          facilityFilter="facility-1"
        />,
      );

      await waitFor(() => expect(screen.getAllByRole('img').length).toBeGreaterThan(0));

      fireEvent.mouseEnter(screen.getAllByRole('img').at(-1)!);

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip');
        expect(tooltip).toHaveTextContent('Unlock');
        expect(tooltip).toHaveTextContent('Total');
      });

      expect(screen.queryByText('Downtown Storage')).not.toBeInTheDocument();
    });

    it('handles empty data gracefully', async () => {
      mockGetActivityStats.mockResolvedValue({
        success: true,
        data: [],
        period: 'month',
      });

      renderWithProviders(<HistogramWidget id="test-widget" title="Activity Histogram" />);

      await waitFor(() => {
        expect(screen.getByText('No activity data for this period')).toBeInTheDocument();
      });
    });
  });
});
