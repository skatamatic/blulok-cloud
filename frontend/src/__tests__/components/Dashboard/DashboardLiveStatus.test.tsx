/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { DashboardLiveStatus } from '@/components/Dashboard/DashboardLiveStatus';

const mockUseWebSocket = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => mockUseWebSocket(),
}));

describe('DashboardLiveStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows Live when connected', () => {
    mockUseWebSocket.mockReturnValue({ isConnected: true, isReconnecting: false });
    render(<DashboardLiveStatus />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByTitle('Dashboard live updates connected')).toBeInTheDocument();
  });

  it('shows Reconnecting when disconnected but reconnecting', () => {
    mockUseWebSocket.mockReturnValue({ isConnected: false, isReconnecting: true });
    render(<DashboardLiveStatus />);
    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
  });

  it('shows Offline when disconnected and not reconnecting', () => {
    mockUseWebSocket.mockReturnValue({ isConnected: false, isReconnecting: false });
    render(<DashboardLiveStatus />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByTitle('Live updates offline')).toBeInTheDocument();
  });
});
