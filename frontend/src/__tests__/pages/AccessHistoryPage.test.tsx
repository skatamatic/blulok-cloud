/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AccessHistoryPage from '@/pages/AccessHistoryPage';

const mockGetAccessHistory = jest.fn();
const mockExportAccessHistory = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getAccessHistory: (...args: unknown[]) => mockGetAccessHistory(...args),
    getFacilityAccessHistory: jest.fn(),
    exportAccessHistory: (...args: unknown[]) => mockExportAccessHistory(...args),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useHighlight', () => ({
  useHighlight: jest.fn(),
}));

jest.mock('@/components/Common/UnitFilter', () => ({
  UnitFilter: () => <div data-testid="unit-filter-stub" />,
}));

jest.mock('@/utils/navigation.utils', () => ({
  ...jest.requireActual<typeof import('@/utils/navigation.utils')>('@/utils/navigation.utils'),
  navigateAndHighlightWithAutoPagination: jest.fn().mockResolvedValue(undefined),
  navigateAndHighlight: jest.fn().mockResolvedValue(undefined),
}));

const mockUseGlobalFacility = jest.fn();

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: jest.fn(() => 'sub-1'),
    unsubscribe: jest.fn(),
    isConnected: false,
  }),
}));

/** Stable auth object — new object each render can retrigger effects that depend on user identity. */
const adminAuth = {
  authState: {
    user: { id: 'admin-1', role: 'admin' as const },
    isAuthenticated: true,
  },
};

describe('AccessHistoryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
    });
    mockUseAuth.mockReturnValue(adminAuth);
    mockGetAccessHistory.mockResolvedValue({
      logs: [],
      total: 0,
    });
    mockExportAccessHistory.mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
  });

  it('renders header and fetches access history', async () => {
    render(
      <MemoryRouter>
        <AccessHistoryPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /access history/i })).toBeInTheDocument();
    expect(
      screen.getByText(/monitor and track all access events across your facilities/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetAccessHistory).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/no access logs found/i)).toBeInTheDocument();
    });
  });

  it('exports filtered access history and triggers download', async () => {
    const user = userEvent.setup();
    // jsdom may not define URL.createObjectURL — stub on window.URL (page uses window.URL.*)
    const urlApi = window.URL as typeof URL & {
      createObjectURL?: (obj: Blob | MediaSource) => string;
      revokeObjectURL?: (id: string) => void;
    };
    const prevCreate = urlApi.createObjectURL;
    const prevRevoke = urlApi.revokeObjectURL;
    const createUrlSpy = jest.fn(() => 'blob:mock-url');
    const revokeSpy = jest.fn();
    urlApi.createObjectURL = createUrlSpy;
    urlApi.revokeObjectURL = revokeSpy;
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    try {
      render(
        <MemoryRouter>
          <AccessHistoryPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockGetAccessHistory).toHaveBeenCalled();
      });

      // Page uses one `loading` flag for fetch + export — wait until list load finishes
      await waitFor(() => {
        expect(screen.getByText(/no access logs found/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^export$/i }));
      await user.click(screen.getByRole('button', { name: /export current filter/i }));

      await waitFor(() => {
        expect(mockExportAccessHistory).toHaveBeenCalled();
      });

      expect(mockExportAccessHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10000,
          date_from: expect.any(String),
          date_to: expect.any(String),
        })
      );
      expect(createUrlSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      urlApi.createObjectURL = prevCreate;
      urlApi.revokeObjectURL = prevRevoke;
      clickSpy.mockRestore();
    }
  });

  it('applies unit_id from URL query on load', async () => {
    render(
      <MemoryRouter initialEntries={['/access-history?unit_id=unit-42&facility_id=fac-1']}>
        <AccessHistoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockGetAccessHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_id: 'unit-42',
          facility_id: 'fac-1',
        })
      );
    });
  });

  it('shows a log row when API returns data', async () => {
    const ts = new Date().toISOString();
    mockGetAccessHistory.mockResolvedValue({
      logs: [
        {
          id: 'log-1',
          device_id: 'd1',
          device_type: 'blulok',
          action: 'unlock',
          method: 'app',
          success: true,
          occurred_at: ts,
          created_at: ts,
          updated_at: ts,
          user_name: 'Casey Jones',
          unit_number: '12',
        },
      ],
      total: 1,
    });

    render(
      <MemoryRouter>
        <AccessHistoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Casey Jones')).toBeInTheDocument();
    });
    expect(screen.getByText(/showing 1 out of 1 access items/i)).toBeInTheDocument();
  });
});
