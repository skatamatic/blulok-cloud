import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GatewayDeviceSyncHistory } from '@/components/Gateway/GatewayDeviceSyncHistory';
import { apiService } from '@/services/api.service';

const mockSubscribe = jest.fn(() => 'sub-sync-history-1');
const mockUnsubscribe = jest.fn();
const mockAddToast = jest.fn();
let mockIsConnected = true;

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: mockIsConnected,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getGatewayDeviceSyncLogs: jest.fn(),
  },
}));

const sampleLog = {
  id: 'sync-log-1',
  gateway_id: 'gw-1',
  facility_id: 'fac-1',
  sync_kind: 'inventory' as const,
  source: 'gateway_ws',
  summary: {
    locks: { added: 1, removed: 0, unchanged: 2, skipped_manual: 0, errors: [] },
    access_control: null,
  },
  entries: [],
  created_at: '2026-06-01T12:00:00.000Z',
};

describe('GatewayDeviceSyncHistory', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockIsConnected = true;
    (apiService.getGatewayDeviceSyncLogs as jest.Mock).mockResolvedValue({
      logs: [sampleLog],
      total: 1,
      hasMore: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders sync history and subscribes to dedicated sync-log updates', async () => {
    render(<GatewayDeviceSyncHistory gatewayId="gw-1" facilityId="fac-1" liveEnabled />);

    await waitFor(() => {
      expect(screen.getByText(/Device inventory sync history/i)).toBeInTheDocument();
    });

    expect(await screen.findByText(/Showing 1 of 1 sync/i)).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(mockSubscribe).toHaveBeenCalledWith(
      'gateway_device_sync_logs',
      expect.any(Function),
      undefined,
      { filters: { facility_id: 'fac-1', gateway_id: 'gw-1' } },
    );
  });

  it('does not poll while websocket is connected', async () => {
    render(<GatewayDeviceSyncHistory gatewayId="gw-1" facilityId="fac-1" liveEnabled />);

    await screen.findByText(/Showing 1 of 1 sync/i);
    expect(apiService.getGatewayDeviceSyncLogs).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(8_000);
    });

    expect(apiService.getGatewayDeviceSyncLogs).toHaveBeenCalledTimes(1);
  });

  it('polls silently when websocket is disconnected', async () => {
    mockIsConnected = false;
    render(<GatewayDeviceSyncHistory gatewayId="gw-1" facilityId="fac-1" liveEnabled />);

    await screen.findByText(/Showing 1 of 1 sync/i);
    expect(screen.getByText('Polling')).toBeInTheDocument();

    (apiService.getGatewayDeviceSyncLogs as jest.Mock).mockResolvedValue({
      logs: [sampleLog, { ...sampleLog, id: 'sync-log-2' }],
      total: 2,
      hasMore: false,
    });

    await act(async () => {
      jest.advanceTimersByTime(8_000);
    });

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 of 2 syncs/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Loading sync history/i)).not.toBeInTheDocument();
  });

  it('prepends rows from websocket subscription callback', async () => {
    let wsCallback: ((data: unknown) => void) | undefined;
    mockSubscribe.mockImplementation((_topic, callback) => {
      wsCallback = callback;
      return 'sub-sync-history-1';
    });

    render(<GatewayDeviceSyncHistory gatewayId="gw-1" facilityId="fac-1" liveEnabled />);
    await screen.findByText(/Showing 1 of 1 sync/i);

    act(() => {
      wsCallback?.({
        logs: [{ ...sampleLog, id: 'sync-log-live', created_at: '2026-06-02T12:00:00.000Z' }],
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 of 2 syncs/i)).toBeInTheDocument();
    });
    expect(apiService.getGatewayDeviceSyncLogs).toHaveBeenCalledTimes(1);
  });

  it('keeps the table visible when manual refresh fails', async () => {
    jest.useRealTimers();
    render(<GatewayDeviceSyncHistory gatewayId="gw-1" facilityId="fac-1" liveEnabled={false} />);
    await screen.findByText(/Showing 1 of 1 sync/i);

    (apiService.getGatewayDeviceSyncLogs as jest.Mock).mockRejectedValueOnce(new Error('network'));

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(screen.getByText(/Could not refresh — showing last loaded data/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Showing 1 of 1 sync/i)).toBeInTheDocument();
    expect(screen.queryByText(/Could not load device inventory sync history/i)).not.toBeInTheDocument();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Could not refresh sync history' }),
    );
  });

  it('spins the refresh button only for manual refresh', async () => {
    jest.useRealTimers();
    render(<GatewayDeviceSyncHistory gatewayId="gw-1" facilityId="fac-1" liveEnabled={false} />);
    await screen.findByText(/Showing 1 of 1 sync/i);

    let resolveRefresh: (value: unknown) => void;
    (apiService.getGatewayDeviceSyncLogs as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    expect(refreshButton.querySelector('.animate-spin')).toBeTruthy();

    await act(async () => {
      resolveRefresh!({ logs: [sampleLog], total: 1, hasMore: false });
    });

    await waitFor(() => {
      expect(refreshButton.querySelector('.animate-spin')).toBeFalsy();
    });
  });

  it('loads more rows when hasMore is true', async () => {
    jest.useRealTimers();
    (apiService.getGatewayDeviceSyncLogs as jest.Mock)
      .mockResolvedValueOnce({
        logs: [sampleLog],
        total: 2,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        logs: [{ ...sampleLog, id: 'sync-log-2' }],
        total: 2,
        hasMore: false,
      });

    render(<GatewayDeviceSyncHistory gatewayId="gw-1" facilityId="fac-1" liveEnabled={false} />);
    await screen.findByText(/Showing 1 of 2 syncs/i);

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 of 2 syncs/i)).toBeInTheDocument();
    });

    expect(apiService.getGatewayDeviceSyncLogs).toHaveBeenLastCalledWith('gw-1', {
      limit: 25,
      offset: 1,
    });
  });
});
