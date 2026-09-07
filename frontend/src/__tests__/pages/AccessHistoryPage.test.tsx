/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import AccessHistoryPage from '@/pages/AccessHistoryPage';
import { ToastProvider } from '@/contexts/ToastContext';

function renderPage(ui: ReactNode, routerOptions?: { initialEntries?: string[] }) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={routerOptions?.initialEntries}>{ui}</MemoryRouter>
    </ToastProvider>
  );
}

const mockGetAccessHistory = jest.fn();
const mockGetAccessSessions = jest.fn();
const mockExportAccessHistory = jest.fn();
const mockExportAccessSessions = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getAccessHistory: (...args: unknown[]) => mockGetAccessHistory(...args),
    getAccessSessions: (...args: unknown[]) => mockGetAccessSessions(...args),
    getFacilityAccessHistory: jest.fn(),
    exportAccessHistory: (...args: unknown[]) => mockExportAccessHistory(...args),
    exportAccessSessions: (...args: unknown[]) => mockExportAccessSessions(...args),
    getAccessSessionById: jest.fn().mockResolvedValue({ session: null, events: [] }),
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

jest.mock('@/hooks/useWebSocketSubscription', () => ({
  useWebSocketSubscription: jest.fn(),
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
    mockGetAccessSessions.mockResolvedValue({
      sessions: [],
      total: 0,
      currently_open: 0,
    });
    mockGetAccessHistory.mockResolvedValue({
      logs: [],
      total: 0,
      view: 'raw',
    });
    mockExportAccessSessions.mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
    mockExportAccessHistory.mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
  });

  it('renders header and fetches access sessions', async () => {
    renderPage(<AccessHistoryPage />);

    expect(screen.getByRole('heading', { name: /access history/i })).toBeInTheDocument();
    expect(
      screen.getByText(/monitor and track access sessions across your facilities/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetAccessSessions).toHaveBeenCalled();
    });

    const initialQuery = mockGetAccessSessions.mock.calls[0][0] as {
      date_from?: string;
      date_to?: string;
      view?: string;
    };
    expect(initialQuery.date_from).toMatch(/Z$/);
    expect(initialQuery.date_to).toMatch(/Z$/);
    expect(initialQuery.view).toBeUndefined();

    await waitFor(() => {
      expect(screen.getByText(/no access sessions found/i)).toBeInTheDocument();
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
      renderPage(<AccessHistoryPage />);

      await waitFor(() => {
        expect(mockGetAccessSessions).toHaveBeenCalled();
      });

      // Page uses one `loading` flag for fetch + export — wait until list load finishes
      await waitFor(() => {
        expect(screen.getByText(/no access sessions found/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^export$/i }));
      await user.click(screen.getByRole('button', { name: /export current filter/i }));

      await waitFor(() => {
        expect(mockExportAccessSessions).toHaveBeenCalled();
      });

      expect(mockExportAccessSessions).toHaveBeenCalledWith(
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
    renderPage(<AccessHistoryPage />, {
      initialEntries: ['/access-history?unit_id=unit-42&facility_id=fac-1'],
    });

    await waitFor(() => {
      expect(mockGetAccessSessions).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_id: 'unit-42',
          facility_id: 'fac-1',
        })
      );
    });
  });

  it('does not force user_id filter for tenant users', async () => {
    mockUseAuth.mockReturnValue({
      authState: {
        user: { id: 'tenant-1', role: 'tenant' as const },
        isAuthenticated: true,
      },
    });

    renderPage(<AccessHistoryPage />);

    await waitFor(() => {
      expect(mockGetAccessSessions).toHaveBeenCalled();
    });

    const initialQuery = mockGetAccessSessions.mock.calls[0][0] as { user_id?: string };
    expect(initialQuery.user_id).toBeUndefined();
  });

  it('shows a session row when API returns data', async () => {
    const ts = new Date().toISOString();
    mockGetAccessSessions.mockResolvedValue({
      sessions: [
        {
          id: 'sess-1',
          kind: 'access',
          origin: 'on_site',
          method: 'app',
          outcome: 'granted',
          state: 'closed',
          device_id: 'd1',
          device_type: 'blulok',
          attempt_count: 1,
          started_at: ts,
          opened_at: ts,
          closed_at: ts,
          open_duration_sec: 45,
          user_name: 'Casey Jones',
          unit_number: '12',
        },
      ],
      total: 1,
      currently_open: 0,
    });

    renderPage(<AccessHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText('Casey Jones')).toBeInTheDocument();
    });
    expect(screen.getByText(/showing 1 out of 1 sessions/i)).toBeInTheDocument();
    expect(screen.getByText('Unit 12')).toBeInTheDocument();
    expect(screen.getByText('Mobile key')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows raw event denial detail when raw view is enabled for DEV_ADMIN', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      authState: {
        user: { id: 'dev-1', role: 'dev_admin' as const },
        isAuthenticated: true,
      },
    });
    const longFailure =
      'Timed out waiting for gateway confirmation — Gateway did not confirm lock command before timeout';
    const ts = new Date().toISOString();
    mockGetAccessHistory.mockResolvedValue({
      logs: [
        {
          id: 'log-denied',
          device_id: 'd1',
          device_type: 'access_control',
          action: 'unlock_attempt',
          method: 'remote_gateway',
          success: false,
          occurred_at: ts,
          created_at: ts,
          updated_at: ts,
          user_name: 'Developer Admin',
          metadata: {
            failure_summary: longFailure,
            user: {
              id: 'admin-1',
              name: 'Developer Admin',
              navigation_url: '/users/admin-1/details',
            },
            device: {
              id: 'd1',
              name: 'Main Gate',
              navigation_url: '/devices/access-control/d1',
            },
          },
        },
      ],
      total: 1,
      view: 'raw',
    });

    renderPage(<AccessHistoryPage />, {
      initialEntries: ['/access-history?view=raw'],
    });

    await waitFor(() => {
      expect(screen.getByText('Unlock attempt denied')).toBeInTheDocument();
    });

    expect(screen.queryByText('Denied')).not.toBeInTheDocument();
    expect(screen.queryByText(longFailure)).not.toBeInTheDocument();

    await user.click(screen.getByText('Unlock attempt denied'));

    await waitFor(() => {
      expect(screen.getByLabelText('Failure reason')).toBeInTheDocument();
    });
    expect(screen.getByText(longFailure)).toBeInTheDocument();
  });

  it('hides Raw events for non DEV_ADMIN roles', async () => {
    renderPage(<AccessHistoryPage />);
    await waitFor(() => {
      expect(mockGetAccessSessions).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: /needs attention/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /raw events/i })).not.toBeInTheDocument();
  });
});
