import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NotificationsWidget } from '@/components/Widget/NotificationsWidget';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DropdownProvider } from '@/contexts/DropdownContext';
import type { UserNotificationApi } from '@/types/notifications.types';

const mockGetNotifications = jest.fn();
const mockMarkNotificationRead = jest.fn();
const mockDeleteNotification = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();
const mockHideAllNotifications = jest.fn();
const mockAddToast = jest.fn();
const mockOpenPendingReview = jest.fn();
const mockGetSyncDetails = jest.fn();

jest.mock('@/services/fms.service', () => ({
  fmsService: {
    getSyncDetails: (...args: unknown[]) => mockGetSyncDetails(...args),
  },
}));

jest.mock('@/contexts/ToastContext', () => ({
  ...jest.requireActual('@/contexts/ToastContext'),
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/contexts/FMSSyncContext', () => ({
  useFMSSync: () => ({ openPendingReview: mockOpenPendingReview }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
    markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
    deleteNotification: (...args: unknown[]) => mockDeleteNotification(...args),
    markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
    hideAllNotifications: (...args: unknown[]) => mockHideAllNotifications(...args),
  },
}));

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

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'facility_admin' as const,
  facilityIds: ['fac-123', 'fac-456'],
  facilityNames: ['Site A', 'Site B'],
};

// Stable identities — inline objects/arrays make hook deps change every render and
// re-fire NotificationsWidget's load effect in an infinite loop (hangs Jest).
const mockAuthState = { user: mockUser, isAuthenticated: true };
const mockFacilities = [
  { id: 'fac-123', name: '621 Sandbox' },
  { id: 'fac-456', name: 'Site B' },
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

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: React.PropsWithChildren<object>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderWithProviders = (component: React.ReactElement) =>
  render(
    <ThemeProvider>
      <DropdownProvider>{component}</DropdownProvider>
    </ThemeProvider>
  );

const baseNotification = (over: Partial<UserNotificationApi>): UserNotificationApi => ({
  id: 'n1',
  type: 'general',
  title: 'Hello',
  message: 'World',
  priority: 'normal',
  isRead: false,
  readAt: null,
  reference: null,
  facilityId: 'fac-123',
  metadata: null,
  createdAt: new Date().toISOString(),
  ...over,
});

describe('NotificationsWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSubscribe.mockReturnValue('sub-1');
    mockGetNotifications.mockResolvedValue({
      success: true,
      notifications: [
        baseNotification({
          id: 'a',
          title: 'Security',
          type: 'security_alert',
          priority: 'high',
          isRead: false,
        }),
        baseNotification({
          id: 'b',
          title: 'FYI',
          type: 'general',
          priority: 'low',
          isRead: true,
        }),
      ],
      total: 2,
      unreadCount: 1,
      limit: 50,
      offset: 0,
    });
    mockMarkNotificationRead.mockResolvedValue({ success: true });
    mockDeleteNotification.mockResolvedValue({ success: true });
    mockMarkAllNotificationsRead.mockResolvedValue({ success: true, markedCount: 2 });
    mockGetSyncDetails.mockImplementation(async (id: unknown) => ({
      id: String(id),
      changes_pending: 1,
      sync_status: 'pending_review',
    }));
  });

  it('loads from notifications API with historical scope', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
          offset: 0,
          includeExpired: true,
        })
      );
    });
  });

  it('subscribes to notifications websocket channel with facility scope', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" />);
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith(
        'notifications',
        expect.any(Function),
        undefined,
        { facilityIds: mockUser.facilityIds },
      );
    });
  });

  it('shows items from API including read notifications by default', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="huge-wide" />);
    await waitFor(() => {
      expect(screen.getByText('Security')).toBeInTheDocument();
      expect(screen.getByText('FYI')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });

  it('filters action required using priority/type rules', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="huge-wide" />);
    await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Action Required \(\d+\)/ }));
    await waitFor(() => {
      expect(screen.getByText('Security')).toBeInTheDocument();
    });
    expect(screen.queryByText('FYI')).not.toBeInTheDocument();
  });

  it('shows facility name in card footer when viewing all facilities', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="huge-wide" />);
    await waitFor(() => {
      expect(screen.getAllByText('621 Sandbox').length).toBeGreaterThan(0);
    });
  });

  it('passes facility filter to API when provided', async () => {
    renderWithProviders(
      <NotificationsWidget id="w1" title="Notifications" facilityFilter="fac-123" />
    );
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ facilityId: 'fac-123' })
      );
    });
  });

  it('shows error when API fails', async () => {
    mockGetNotifications.mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load notifications')).toBeInTheDocument();
    });
  });

  it('expands a notification card to show full message', async () => {
    mockGetNotifications.mockResolvedValueOnce({
      success: true,
      notifications: [
        baseNotification({
          id: 'long-1',
          title: 'Gateway offline',
          message: 'Main gateway has been offline for more than five minutes. Check power and network connectivity at the facility entrance.',
        }),
      ],
      total: 1,
      unreadCount: 1,
      limit: 50,
      offset: 0,
    });

    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => expect(screen.getByText('Gateway offline')).toBeInTheDocument());

    expect(screen.getByText(/Check power and network connectivity/)).toHaveClass('line-clamp-2');

    fireEvent.click(screen.getByRole('button', { name: /Gateway offline/i }));
    await waitFor(() => {
      const full = screen.getByText(/Check power and network connectivity/);
      expect(full).toHaveClass('whitespace-pre-wrap');
    });
  });

  it('marks notification read when expanded', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="huge-wide" />);
    await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Security/i }));

    await waitFor(() => {
      expect(mockMarkNotificationRead).toHaveBeenCalledWith('a');
    });
  });

  it('stays expanded after mark read and websocket count update', async () => {
    mockGetNotifications.mockResolvedValue({
      success: true,
      notifications: [
        baseNotification({
          id: 'long-1',
          title: 'Gateway offline',
          message:
            'Main gateway has been offline for more than five minutes. Check power and network connectivity at the facility entrance.',
        }),
      ],
      total: 1,
      unreadCount: 1,
      limit: 50,
      offset: 0,
    });

    let wsHandler: ((data: unknown) => void) | undefined;
    mockSubscribe.mockImplementation((_type, handler) => {
      wsHandler = handler;
      return 'sub-1';
    });

    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => expect(screen.getByText('Gateway offline')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Gateway offline/i }));
    await waitFor(() => {
      expect(screen.getByText(/Check power and network connectivity/)).toHaveClass('whitespace-pre-wrap');
    });

    await waitFor(() => expect(mockMarkNotificationRead).toHaveBeenCalledWith('long-1'));

    wsHandler?.({
      eventType: 'notifications_count_update',
      payload: { unreadCount: 0, lastUpdated: new Date().toISOString() },
    });

    await waitFor(() => {
      expect(screen.getByText(/Check power and network connectivity/)).toHaveClass('whitespace-pre-wrap');
    });
    expect(mockGetNotifications).toHaveBeenCalledTimes(1);
  });

  it('keeps expanded notification visible in unread filter after mark read', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="huge-wide" />);
    await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Unread \(\d+\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Security/i }));

    await waitFor(() => expect(mockMarkNotificationRead).toHaveBeenCalledWith('a'));
    await waitFor(() => {
      expect(screen.getByText('Security')).toBeInTheDocument();
      expect(screen.getByText(/World/)).toHaveClass('whitespace-pre-wrap');
    });
  });

  it('shows toast when mark read fails on expand', async () => {
    mockMarkNotificationRead.mockRejectedValueOnce(new Error('network'));
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="huge-wide" />);
    await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Security/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Could not mark as read' }),
      );
    });
  });

  it('shows fms_webhook_received notifications from websocket events', async () => {
    mockGetNotifications.mockResolvedValueOnce({
      success: true,
      notifications: [],
      total: 0,
      unreadCount: 0,
      limit: 50,
      offset: 0,
    });

    let wsHandler: ((data: unknown) => void) | undefined;
    mockSubscribe.mockImplementation((_type, handler) => {
      wsHandler = handler;
      return 'sub-1';
    });

    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    wsHandler?.({
      eventType: 'notification_created',
      payload: {
        notificationId: 'wh-1',
        type: 'fms_webhook_received',
        title: 'FMS Webhook Received',
        message: '621 Sandbox: Tenant Updated · alex@example.com. 1 change(s) pending review.',
        priority: 'low',
        facilityId: 'fac-123',
        metadata: {
          eventType: 'tenant.updated',
          payload: { tenant_id: 'ten-1', email: 'alex@example.com' },
        },
        timestamp: new Date().toISOString(),
      },
    });

    await waitFor(() => {
      expect(screen.getByText('FMS Update Push')).toBeInTheDocument();
      expect(screen.getByText(/alex@example.com/)).toBeInTheDocument();
    });
  });

  it('opens the FMS review modal from a webhook notification that needs review', async () => {
    mockGetNotifications.mockResolvedValueOnce({
      success: true,
      notifications: [
        baseNotification({
          id: 'wh-review',
          type: 'fms_webhook_received',
          title: 'FMS Update Push',
          message: '3 changes need your review',
          priority: 'high',
          metadata: { requiresReview: true, syncLogId: 'sync-wh-1', eventType: 'ledger.moved-in' },
        }),
      ],
      total: 1,
      unreadCount: 1,
      limit: 50,
      offset: 0,
    });

    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    await waitFor(() => {
      expect(mockOpenPendingReview).toHaveBeenCalledWith('fac-123', 'sync-wh-1', '621 Sandbox');
    });
  });

  it('opens the FMS review modal from a full-sync notification that blocked automatic apply', async () => {
    mockGetNotifications.mockResolvedValueOnce({
      success: true,
      notifications: [
        baseNotification({
          id: 'sync-review',
          type: 'fms_sync_complete',
          title: 'FMS Changes Need Review',
          message: 'Automatic sync did not apply because a problem was detected.',
          priority: 'high',
          reference: { type: 'fms_sync', id: 'sync-hq-1' },
          metadata: {
            requiresReview: true,
            autoApplyBlocked: true,
            pendingCount: 1,
            problemSummaries: ['Shared phone matches an already-mapped tenant.'],
          },
        }),
      ],
      total: 1,
      unreadCount: 1,
      limit: 50,
      offset: 0,
    });

    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    await waitFor(() => {
      expect(mockOpenPendingReview).toHaveBeenCalledWith('fac-123', 'sync-hq-1', '621 Sandbox');
    });
  });

  it('combines repeated FMS update pushes into one expandable card', async () => {
    mockGetNotifications.mockResolvedValueOnce({
      success: true,
      notifications: [
        baseNotification({
          id: 'lead-1',
          type: 'fms_webhook_received',
          title: 'FMS Update Push',
          message:
            'BluLok HQ received a lead move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
          priority: 'high',
          metadata: {
            eventType: 'lead.moved-in',
            requiresReview: true,
            syncLogId: 'sync-a',
            subjectLabel: 'Tester Three · Unit 100',
            facilityName: 'BluLok HQ',
          },
        }),
        baseNotification({
          id: 'move-1',
          type: 'fms_webhook_received',
          title: 'FMS Update Push',
          message:
            'BluLok HQ received a tenant move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
          priority: 'high',
          metadata: {
            eventType: 'ledger.moved-in',
            requiresReview: true,
            syncLogId: 'sync-b',
            subjectLabel: 'Tester Three · Unit 100',
            facilityName: 'BluLok HQ',
          },
        }),
      ],
      total: 2,
      unreadCount: 2,
      limit: 50,
      offset: 0,
    });

    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);

    await waitFor(() => expect(screen.getByText('2 updates')).toBeInTheDocument());
    expect(screen.getAllByText('FMS Update Push')).toHaveLength(1);

    fireEvent.click(screen.getByText('FMS Update Push'));
    expect(screen.getByText('Lead move-in')).toBeInTheDocument();
    expect(screen.getByText('Tenant move-in')).toBeInTheDocument();

    await waitFor(() => expect(mockMarkNotificationRead).toHaveBeenCalled());
    expect(screen.getByText('2 updates')).toBeInTheDocument();
    expect(screen.getAllByText('FMS Update Push')).toHaveLength(1);
  });

  it('hides Review changes and rewrites copy when the review queue is already dismissed', async () => {
    mockGetSyncDetails.mockResolvedValue({
      id: 'sync-wh-1',
      changes_pending: 0,
      sync_status: 'completed',
    });
    mockGetNotifications.mockResolvedValueOnce({
      success: true,
      notifications: [
        baseNotification({
          id: 'wh-review',
          type: 'fms_webhook_received',
          title: 'FMS Update Push',
          message:
            'BluLok HQ received a tenant move-in update. 3 changes need your review before they take effect. (Tester Three · Unit 100)',
          priority: 'high',
          metadata: {
            requiresReview: true,
            syncLogId: 'sync-wh-1',
            eventType: 'ledger.moved-in',
            subjectLabel: 'Tester Three · Unit 100',
          },
        }),
      ],
      total: 1,
      unreadCount: 1,
      limit: 50,
      offset: 0,
    });

    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);

    await waitFor(() => {
      expect(
        screen.getByText(/Those changes have already been reviewed or dismissed/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Review changes' })).not.toBeInTheDocument();
  });

  it('hides a notification from the widget when delete is clicked', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument());

    const hideButtons = screen.getAllByRole('button', { name: 'Hide notification' });
    fireEvent.click(hideButtons[0]!);

    await waitFor(() => {
      expect(mockDeleteNotification).toHaveBeenCalledWith('a');
      expect(screen.queryByText('Security')).not.toBeInTheDocument();
    });
  });

  it('loads hidden notifications when Including Hidden filter is selected', async () => {
    renderWithProviders(
      <NotificationsWidget id="w1" title="Notifications" initialSize="huge-wide" />,
    );
    await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Including Hidden/i }));

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          includeHidden: true,
        }),
      );
    });
  });

  it('clears all visible notifications when Clear all is clicked', async () => {
    mockHideAllNotifications.mockResolvedValue({ success: true, hiddenCount: 2 });

    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    await waitFor(() => {
      expect(mockHideAllNotifications).toHaveBeenCalled();
      expect(screen.queryByText('Security')).not.toBeInTheDocument();
    });
  });
});
