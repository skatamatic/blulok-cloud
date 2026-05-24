/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '@/pages/DashboardPage';
import { UserRole } from '@/types/auth.types';
import { ToastProvider } from '@/contexts/ToastContext';

const mockUseAuth = jest.fn();
const mockUseGlobalFacility = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ALL_FACILITIES_ID: '__ALL_FACILITIES__',
  useGlobalFacility: () => mockUseGlobalFacility(),
}));

jest.mock('@/hooks/useGeneralStatsData', () => ({
  useGeneralStatsData: () => ({
    stats: {
      facilities: { total: 2 },
      devices: { total: 3 },
      users: { total: 4 },
      alerts: { open: 1 },
    },
    loading: false,
    error: null,
    canAccess: true,
    getHandlers: () => ({ onData: jest.fn(), onError: jest.fn() }),
  }),
}));

jest.mock('@/services/widget-subscription-manager', () => ({
  widgetSubscriptionManager: {
    subscribe: jest.fn(),
    updateSubscriptions: jest.fn(),
    unsubscribe: jest.fn(),
    unsubscribeAll: jest.fn(),
  },
}));

jest.mock('@/services/websocket.service', () => ({
  websocketService: {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    onMessage: jest.fn(() => jest.fn()),
  },
}));

const mockGetWidgetLayouts = jest.fn();
const mockSaveWidgetLayouts = jest.fn();
const mockSaveDashboard = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getWidgetLayouts: () => mockGetWidgetLayouts(),
    saveWidgetLayouts: (...args: unknown[]) => mockSaveWidgetLayouts(...args),
    saveDashboard: (...args: unknown[]) => mockSaveDashboard(...args),
    hideWidget: jest.fn(),
  },
}));

jest.mock('@/components/Dashboard/DashboardCanvas', () => ({
  DashboardCanvas: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dashboard-canvas">{children}</div>
  ),
}));

jest.mock('@/components/Widget/StatsWidget', () => ({
  StatsWidget: () => <div data-testid="stats-widget" />,
}));
jest.mock('@/components/Widget/HistogramWidget', () => ({
  HistogramWidget: () => <div data-testid="histogram-widget" />,
}));
jest.mock('@/components/Widget/AddWidgetModal', () => ({ AddWidgetModal: () => null }));
jest.mock('@/components/UserManagement/AddUserModal', () => ({ AddUserModal: () => null }));
jest.mock('@/components/Widget/ActivityMonitorWidget', () => ({
  ActivityMonitorWidget: () => <div data-testid="activity-monitor-widget" />,
}));
jest.mock('@/components/Widget/RemoteGateWidget', () => ({
  RemoteGateWidget: () => <div data-testid="remote-gate-widget" />,
}));
jest.mock('@/components/Widget/NotificationsWidget', () => ({
  NotificationsWidget: () => <div data-testid="notifications-widget" />,
}));
jest.mock('@/components/Widget/BatteryStatusWidget', () => ({
  BatteryStatusWidget: () => <div data-testid="battery-widget" />,
}));
jest.mock('@/components/Widget/UnlockedUnitsWidget', () => ({
  UnlockedUnitsWidget: () => <div data-testid="unlocked-units-widget" />,
}));
jest.mock('@/components/Widget/SyncFMSWidget', () => ({
  SyncFMSWidget: () => <div data-testid="sync-fms-widget" />,
}));
jest.mock('@/components/Widget/AccessHistoryWidget', () => ({
  AccessHistoryWidget: () => <div data-testid="access-history-widget" />,
}));
jest.mock('@/components/Widget/SharedKeysWidget', () => ({
  SharedKeysWidget: () => <div data-testid="shared-keys-widget" />,
}));
jest.mock('@/components/Widget/LockStatusWidget', () => ({
  LockStatusWidget: () => <div data-testid="lock-status-widget" />,
}));
jest.mock('@/components/Widget/FacilityViewerWidget', () => ({
  FacilityViewerWidget: () => <div data-testid="facility-viewer-widget" />,
}));
jest.mock('@/components/Widget/DailyAccessCodesWidget', () => ({
  DailyAccessCodesWidget: () => <div data-testid="daily-access-widget" />,
}));
jest.mock('@/components/Widget/UnitsManagerWidget', () => ({
  UnitsManagerWidget: () => <div data-testid="units-manager-widget" />,
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockGetWidgetLayouts.mockResolvedValue({
      pages: [],
      layouts: [],
      layoutSource: 'default',
      canEditLayout: true,
      allowMultiplePages: true,
    });
    mockSaveWidgetLayouts.mockResolvedValue(undefined);
    mockUseGlobalFacility.mockReturnValue({
      selectedFacilityId: '__ALL_FACILITIES__',
    });
    mockUseAuth.mockReturnValue({
      authState: {
        isAuthenticated: true,
        user: {
          id: 'u1',
          firstName: 'Jordan',
          role: UserRole.ADMIN,
        },
      },
      logout: jest.fn(),
      hasRole: jest.fn(() => true),
      isAdmin: jest.fn(() => true),
      canManageUsers: jest.fn(() => true),
    });
  });

  it('loads layout and shows welcome for admin', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <DashboardPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back, jordan/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/admin dashboard/i)).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-canvas')).toBeInTheDocument();
    expect(screen.getByTitle('Dashboard settings')).toBeInTheDocument();
    expect(mockGetWidgetLayouts).toHaveBeenCalled();
  });

  it('hides dashboard settings for facility admin (read-only layout)', async () => {
    mockGetWidgetLayouts.mockResolvedValue({
      pages: [],
      layouts: [],
      layoutSource: 'assigned',
      canEditLayout: false,
      allowMultiplePages: false,
      assignedDashboardName: 'Staff default',
    });
    mockUseAuth.mockReturnValue({
      authState: {
        isAuthenticated: true,
        user: {
          id: 'fa1',
          firstName: 'Frank',
          role: UserRole.FACILITY_ADMIN,
        },
      },
      logout: jest.fn(),
      hasRole: jest.fn(() => true),
      isAdmin: jest.fn(() => false),
      canManageUsers: jest.fn(() => true),
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <DashboardPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back, frank/i })).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Dashboard settings')).not.toBeInTheDocument();
    expect(screen.getByText(/dashboard managed by your organization/i)).toBeInTheDocument();
    expect(screen.getByTitle('Add new user')).toBeInTheDocument();
  });

  it('shows revert banner when admin has personal override over assigned template', async () => {
    mockGetWidgetLayouts.mockResolvedValue({
      pages: [{ id: 'p1', name: 'Main', pageOrder: 0, widgets: [] }],
      layouts: [],
      layoutSource: 'personal',
      canEditLayout: true,
      allowMultiplePages: false,
      hasAssignedOverride: true,
      assignedDashboardName: 'Org Standard',
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <DashboardPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/personal layout active/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /revert to assigned/i })).toBeInTheDocument();
    expect(screen.getByText(/org standard/i)).toBeInTheDocument();
  });

  it('shows tenant copy and tenant widget stubs', async () => {
    mockGetWidgetLayouts.mockResolvedValue({
      pages: [],
      layouts: [],
      layoutSource: 'default',
      canEditLayout: false,
      allowMultiplePages: false,
    });
    mockUseAuth.mockReturnValue({
      authState: {
        isAuthenticated: true,
        user: {
          id: 't1',
          firstName: 'Taylor',
          role: UserRole.TENANT,
        },
      },
      logout: jest.fn(),
      hasRole: jest.fn(() => true),
      isAdmin: jest.fn(() => false),
      canManageUsers: jest.fn(() => false),
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <DashboardPage />
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back, taylor/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/tenant dashboard/i)).toBeInTheDocument();
    expect(screen.getByTestId('access-history-widget')).toBeInTheDocument();
    expect(screen.getByTestId('lock-status-widget')).toBeInTheDocument();
  });
});
