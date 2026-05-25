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

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
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

  it('loads from notifications API', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="large" />);
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, offset: 0 })
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

  it('shows items from API', async () => {
    renderWithProviders(<NotificationsWidget id="w1" title="Notifications" initialSize="huge-wide" />);
    await waitFor(() => {
      expect(screen.getByText('Security')).toBeInTheDocument();
    });
    // Default filter is "unread" — read items are hidden until "All" is selected
    fireEvent.click(screen.getByRole('button', { name: /All \(\d+\)/ }));
    await waitFor(() => {
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
});
