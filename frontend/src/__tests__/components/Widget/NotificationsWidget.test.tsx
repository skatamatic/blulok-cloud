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

jest.mock('@/services/api.service', () => ({
  apiService: {
    getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
    markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
    deleteNotification: (...args: unknown[]) => mockDeleteNotification(...args),
    markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
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

jest.mock('@/contexts/GlobalFacilityContext', () => ({
  ...jest.requireActual('@/contexts/GlobalFacilityContext'),
  useGlobalFacility: () => ({
    facilities: [
      { id: 'fac-123', name: '621 Sandbox' },
      { id: 'fac-456', name: 'Site B' },
    ],
    selectedFacilityId: '__ALL_FACILITIES__',
    isAllFacilitiesSelected: true,
  }),
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
});
