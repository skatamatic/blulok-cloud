import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GatewayTelemetryLogsTab } from '@/components/Gateway/GatewayTelemetryLogsTab';
import { apiService } from '@/services/api.service';

const mockSubscribe = jest.fn(() => 'sub-telemetry-1');
const mockUnsubscribe = jest.fn();

jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  }),
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    getGatewayTelemetryLogs: jest.fn(),
  },
}));

const sampleLog = {
  id: 'log-1',
  gateway_id: 'gw-1',
  facility_id: 'fac-1',
  logged_at: '2026-05-26T09:53:21.653Z',
  payload: { message: 'Gateway heartbeat OK', header: '0201', data: { lock_id: 'lock-abc' } },
  source: 'gateway_ws',
  created_at: '2026-05-26T09:53:22.000Z',
};

describe('GatewayTelemetryLogsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiService.getGatewayTelemetryLogs as jest.Mock).mockResolvedValue({
      success: true,
      logs: [sampleLog],
      total: 1,
      limit: 500,
      offset: 0,
      hasMore: false,
    });
  });

  it('renders logs and subscribes to live updates', async () => {
    render(<GatewayTelemetryLogsTab gatewayId="gw-1" facilityId="fac-1" liveEnabled />);

    await waitFor(() => {
      expect(screen.getByText(/Gateway logs/i)).toBeInTheDocument();
    });

    expect(await screen.findByText(/Gateway heartbeat OK/i)).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(mockSubscribe).toHaveBeenCalledWith(
      'gateway_telemetry_logs',
      expect.any(Function),
      undefined,
      { filters: { facility_id: 'fac-1', gateway_id: 'gw-1' } },
    );
  });

  it('loads more when hasMore is true', async () => {
    (apiService.getGatewayTelemetryLogs as jest.Mock)
      .mockResolvedValueOnce({
        success: true,
        logs: [sampleLog],
        total: 2,
        limit: 500,
        offset: 0,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        success: true,
        logs: [{ ...sampleLog, id: 'log-2', payload: { message: 'Second line' } }],
        total: 2,
        limit: 500,
        offset: 1,
        hasMore: false,
      });

    render(<GatewayTelemetryLogsTab gatewayId="gw-1" facilityId="fac-1" liveEnabled={false} />);
    const loadMore = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(loadMore);

    await waitFor(() => {
      expect(apiService.getGatewayTelemetryLogs).toHaveBeenCalledTimes(2);
    });
  });

  it('applies filters when Apply is clicked', async () => {
    render(<GatewayTelemetryLogsTab gatewayId="gw-1" facilityId="fac-1" liveEnabled={false} />);
    await screen.findByText(/Gateway heartbeat OK/i);

    const searchInput = screen.getByPlaceholderText(/Free-text search/i);
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, 'lock');
    await userEvent.click(screen.getByRole('button', { name: /^Apply$/i }));

    await waitFor(() => {
      expect(apiService.getGatewayTelemetryLogs).toHaveBeenLastCalledWith(
        'gw-1',
        expect.objectContaining({ search: 'lock' }),
      );
    });
  });

  it('enables Apply when JSON value is entered without clicking Add filter', async () => {
    render(<GatewayTelemetryLogsTab gatewayId="gw-1" facilityId="fac-1" liveEnabled={false} />);
    await screen.findByText(/Gateway heartbeat OK/i);

    const applyButton = screen.getByRole('button', { name: /^Apply$/i });
    expect(applyButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/e\.g\. data\.lock_id/i), 'data.lock_id');
    await userEvent.type(screen.getByPlaceholderText(/Filter value/i), 'lock-abc');

    expect(applyButton).toBeEnabled();
  });

  it('passes source filter to the API', async () => {
    render(<GatewayTelemetryLogsTab gatewayId="gw-1" facilityId="fac-1" liveEnabled={false} />);
    await screen.findByText(/Gateway heartbeat OK/i);

    await userEvent.selectOptions(screen.getByLabelText(/Source/i), 'cloud_system');
    await userEvent.click(screen.getByRole('button', { name: /^Apply$/i }));

    await waitFor(() => {
      expect(apiService.getGatewayTelemetryLogs).toHaveBeenLastCalledWith(
        'gw-1',
        expect.objectContaining({ source: 'cloud_system' }),
      );
    });
  });
});
