/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AccessHistoryWidget } from '@/components/Widget/AccessHistoryWidget';

const mockGetAccessHistory = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    getAccessHistory: (...args: unknown[]) => mockGetAccessHistory(...args),
  },
}));

// Stable authState.user identity — inline objects make [authState.user] change every render
// and re-fire useEffect, leaving the UI stuck on "Loading..." during async error tests.
jest.mock('@/contexts/AuthContext', () => {
  const authState = { user: { id: 'user-1' } };
  return {
    useAuth: () => ({ authState }),
  };
});

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

jest.mock('@/components/Widget/Widget', () => ({
  Widget: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

describe('AccessHistoryWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessHistory.mockReset();
    mockGetAccessHistory.mockResolvedValue({ logs: [], total: 0 });
  });

  it('shows loading then empty state', async () => {
    mockGetAccessHistory.mockResolvedValue({ logs: [], total: 0 });

    render(
      <AccessHistoryWidget currentSize="medium" onSizeChange={jest.fn()} />
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/no access history found/i)).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    mockGetAccessHistory.mockRejectedValue(new Error('network'));

    render(
      <AccessHistoryWidget currentSize="medium" onSizeChange={jest.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load access history/i)).toBeInTheDocument();
    });
  });

  it('renders access rows for medium size', async () => {
    const occurred = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockGetAccessHistory.mockResolvedValue({
      logs: [
        {
          id: 'l1',
          device_id: 'd1',
          device_type: 'blulok',
          action: 'unlock',
          method: 'app',
          success: true,
          occurred_at: occurred,
          created_at: occurred,
          updated_at: occurred,
          unit_number: '101',
          user_name: 'Pat Smith',
        },
      ],
      total: 1,
    });

    render(
      <AccessHistoryWidget currentSize="medium" onSizeChange={jest.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Unit 101')).toBeInTheDocument();
    });
    expect(screen.getByText('Pat Smith')).toBeInTheDocument();
    expect(screen.getByText('Unlock')).toBeInTheDocument();
  });
});
