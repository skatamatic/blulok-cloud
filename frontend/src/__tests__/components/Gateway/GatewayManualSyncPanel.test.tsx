/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { GatewayManualSyncPanel } from '@/components/Gateway/GatewayManualSyncPanel';
import { apiService } from '@/services/api.service';
import { getWsBaseUrl } from '@/services/appConfig';

jest.mock('@/services/api.service');
jest.mock('@/services/appConfig', () => ({
  getWsBaseUrl: jest.fn(() => 'ws://backend.example.com'),
  getApiBaseUrl: jest.fn(() => 'http://localhost:3000'),
}));

const mockAddToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

const mockApiService = apiService as jest.Mocked<typeof apiService>;
const mockGetWsBaseUrl = getWsBaseUrl as jest.Mock;

describe('GatewayManualSyncPanel', () => {
  const copyToClipboard = jest.fn();
  const onNavigateToInventorySync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWsBaseUrl.mockReturnValue('ws://backend.example.com');
  });

  it('shows empty state when no gateway is bound', () => {
    render(
      <GatewayManualSyncPanel
        gateway={null}
        facilityId="fac-1"
        recoveryBlocking={false}
        isPlatformAdmin
        copyToClipboard={copyToClipboard}
      />,
    );

    expect(
      screen.getByText(/Bind a gateway via Swap \/ Recovery before syncing/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument();
  });

  it('shows recovery banner and disables Sync Now while recovery is blocking', () => {
    render(
      <GatewayManualSyncPanel
        gateway={{ id: 'gateway-1' }}
        facilityId="fac-1"
        recoveryBlocking
        isPlatformAdmin
        copyToClipboard={copyToClipboard}
      />,
    );

    expect(
      screen.getByText(/Gateway recovery in progress. Manual sync is blocked/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sync Now/i })).toBeDisabled();
  });

  it('runs sync successfully and logs results including warnings', async () => {
    mockApiService.syncGateway.mockResolvedValue({
      success: true,
      data: {
        devices: [{ id: 'lock-1', serial: 'S-1', online: true, locked: true, signalStrength: 80, keys: [] }],
        syncResults: {
          devicesFound: 1,
          devicesSynced: 1,
          keysRetrieved: 0,
          errors: ['Device S-1 weak signal'],
        },
      },
    } as any);

    render(
      <GatewayManualSyncPanel
        gateway={{ id: 'gateway-1' }}
        facilityId="fac-1"
        recoveryBlocking={false}
        isPlatformAdmin
        onNavigateToInventorySync={onNavigateToInventorySync}
        copyToClipboard={copyToClipboard}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Sync Now'));
    });

    await waitFor(() => {
      expect(mockApiService.syncGateway).toHaveBeenCalledWith('gateway-1');
      expect(mockAddToast).toHaveBeenCalledWith({
        type: 'success',
        title: 'Gateway synchronization completed',
      });
      expect(screen.getByText(/Sync completed with 1 warning/i)).toBeInTheDocument();
      expect(screen.getByText(/Error 1: Device S-1 weak signal/i)).toBeInTheDocument();
      expect(screen.getByText('S-1')).toBeInTheDocument();
    });
  });

  it('surfaces API errors in toast and sync log', async () => {
    mockApiService.syncGateway.mockRejectedValue({
      response: {
        data: {
          message: 'Gateway synchronization failed',
          error: 'Connection timeout',
        },
      },
    });

    render(
      <GatewayManualSyncPanel
        gateway={{ id: 'gateway-1' }}
        facilityId="fac-1"
        recoveryBlocking={false}
        isPlatformAdmin={false}
        copyToClipboard={copyToClipboard}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Sync Now'));
    });

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith({
        type: 'error',
        title: 'Gateway synchronization failed',
      });
      expect(
        screen.getByText(/Synchronization failed: Connection timeout/i),
      ).toBeInTheDocument();
    });
  });

  it('copies WebSocket URL and AUTH example', () => {
    render(
      <GatewayManualSyncPanel
        gateway={{ id: 'gateway-1' }}
        facilityId="fac-99"
        recoveryBlocking={false}
        isPlatformAdmin
        copyToClipboard={copyToClipboard}
      />,
    );

    fireEvent.click(screen.getByLabelText('Copy WebSocket URL'));
    expect(copyToClipboard).toHaveBeenCalledWith(
      'ws://backend.example.com/ws/gateway',
      'Copied WebSocket URL',
    );

    fireEvent.click(screen.getByLabelText('Copy AUTH JSON example'));
    expect(copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('"facilityId":"fac-99"'),
      'Copied AUTH example',
    );
  });

  it('links platform admins to inventory sync trail', () => {
    render(
      <GatewayManualSyncPanel
        gateway={{ id: 'gateway-1' }}
        facilityId="fac-1"
        recoveryBlocking={false}
        isPlatformAdmin
        onNavigateToInventorySync={onNavigateToInventorySync}
        copyToClipboard={copyToClipboard}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inventory sync' }));
    expect(onNavigateToInventorySync).toHaveBeenCalled();
  });
});
