import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@/__tests__/mocks/websocket-provider-deps';
import { FacilityFMSTab } from '@/components/FMS/FacilityFMSTab';
import { fmsService } from '@/services/fms.service';
import { FMSProviderType, FMSSyncStatus } from '@/types/fms.types';
import { ToastProvider } from '@/contexts/ToastContext';
import ToastContainer from '@/components/Toast/ToastContainer';
import { FMSSyncProvider } from '@/contexts/FMSSyncContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

jest.mock('@/services/fms.service');

const mockFmsService = fmsService as jest.Mocked<typeof fmsService>;

describe('FacilityFMSTab simplified UI', () => {
  const facilityId = 'test-facility-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFmsService.getConfig.mockResolvedValue({
      id: 'config-1',
      facility_id: facilityId,
      provider_type: FMSProviderType.SIMULATED,
      is_enabled: true,
      config: {} as any,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    mockFmsService.getSyncHistory.mockResolvedValue({
      logs: [
        {
          id: 'sync-open',
          facility_id: facilityId,
          fms_config_id: 'config-1',
          sync_status: FMSSyncStatus.PENDING_REVIEW,
          started_at: new Date().toISOString(),
          triggered_by: 'manual',
          changes_detected: 2,
          changes_applied: 0,
          changes_pending: 2,
          changes_rejected: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });
    mockFmsService.getWebhookEvents.mockResolvedValue({ events: [] });
  });

  it('hides configuration and shows test/sync/review on history', async () => {
    render(
      <WebSocketProvider>
        <ToastProvider>
          <ToastContainer />
          <FMSSyncProvider>
            <FacilityFMSTab facilityId={facilityId} simplifiedUi />
          </FMSSyncProvider>
        </ToastProvider>
      </WebSocketProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('fms-simplified-view')).toBeInTheDocument();
    });

    expect(screen.getByText('FMS Sync')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync Now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.queryByText('FMS Configuration')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent Webhooks')).not.toBeInTheDocument();
    expect(screen.queryByText('Sync Operations')).not.toBeInTheDocument();
    expect(mockFmsService.getWebhookEvents).not.toHaveBeenCalled();
  });

  it('calls test connection from the simplified action bar', async () => {
    mockFmsService.testConnection.mockResolvedValue(true);

    render(
      <WebSocketProvider>
        <ToastProvider>
          <ToastContainer />
          <FMSSyncProvider>
            <FacilityFMSTab facilityId={facilityId} simplifiedUi />
          </FMSSyncProvider>
        </ToastProvider>
      </WebSocketProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));

    await waitFor(() => {
      expect(mockFmsService.testConnection).toHaveBeenCalledWith('config-1');
    });
  });
});
