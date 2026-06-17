import { render, screen, waitFor } from '@testing-library/react';
import GatewaySwapRecoveryTab from '@/components/Gateway/GatewaySwapRecoveryTab';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    getGatewayRecoveryCandidates: jest.fn(),
    getGatewayRecoveryStatus: jest.fn(),
    getGatewayRecoveryInventoryPreview: jest.fn(),
    getGatewayRecoveryOptions: jest.fn(),
    getGatewayRecoveryEvents: jest.fn(),
    initiateGatewayRecovery: jest.fn(),
    bypassGatewayRecovery: jest.fn(),
    cancelGatewayRecovery: jest.fn(),
    retryGatewayRecovery: jest.fn(),
  },
}));

const mockAddToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

const mockSubscribe = jest.fn(() => 'sub-recovery-1');
const mockUnsubscribe = jest.fn();
jest.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isConnected: true,
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authState: { user: { role: 'admin' } },
  }),
}));

describe('GatewaySwapRecoveryTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockResolvedValue({
      data: {
        candidates: [{ gatewayId: 'gw-new', connected: true }],
        recovery: { id: 'rec-1', status: 'detected', gateway_id: 'gw-new', facility_id: 'fac-1' },
      },
    });
    (apiService.getGatewayRecoveryStatus as jest.Mock).mockResolvedValue({
      data: { id: 'rec-1', status: 'detected', gateway_id: 'gw-new', facility_id: 'fac-1' },
    });
    (apiService.getGatewayRecoveryInventoryPreview as jest.Mock).mockResolvedValue({
      data: { devices: [{ kind: 'lock', serial: 'L-001' }] },
    });
    (apiService.getGatewayRecoveryOptions as jest.Mock).mockResolvedValue({
      data: {
        firmwareOptions: [{ id: 'fw-1', version: '1.0.0', label: '1.0.0' }],
        provisioningBackupOptions: [{ id: 'pb-1', label: 'backup.tar' }],
        defaultFirmwareId: 'fw-1',
        defaultProvisioningBackupId: 'pb-1',
      },
    });
    (apiService.getGatewayRecoveryEvents as jest.Mock).mockResolvedValue({
      data: { events: [{ id: 'evt-1', phase: 'detected', message: 'Detected', progress_percent: 0, created_at: new Date().toISOString() }] },
    });
  });

  it('shows detection banner when swap candidate present', async () => {
    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(screen.getByText(/New gateway detected/i)).toBeInTheDocument();
    });
  });

  it('renders phased recovery stepper labels', async () => {
    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(screen.getByText('Firmware')).toBeInTheDocument();
      expect(screen.getByText('Provisioning')).toBeInTheDocument();
      expect(screen.getByText('Inventory Push')).toBeInTheDocument();
    });
  });

  it('subscribes to gateway_recovery_progress websocket', async () => {
    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith('gateway_recovery_progress', expect.any(Function));
    });
  });

  it('unsubscribes from gateway_recovery_progress on unmount', async () => {
    const { unmount } = render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledWith('sub-recovery-1');
  });

  it('shows firmware and provisioning selectors before start', async () => {
    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(screen.getByText('Recovery configuration')).toBeInTheDocument();
      expect(screen.getByText('Firmware image')).toBeInTheDocument();
      expect(screen.getByText('Provisioning backup')).toBeInTheDocument();
    });
  });

  it('shows bypass option while recovery is detected', async () => {
    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Bypass recovery \(advanced\)/i)).toBeInTheDocument();
    });
  });

  it('shows retry action when recovery has failed', async () => {
    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockResolvedValue({
      data: {
        candidates: [{ gatewayId: 'gw-new', connected: true }],
        recovery: { id: 'rec-1', status: 'failed', gateway_id: 'gw-new', facility_id: 'fac-1' },
      },
    });
    (apiService.getGatewayRecoveryStatus as jest.Mock).mockResolvedValue({
      data: { id: 'rec-1', status: 'failed', gateway_id: 'gw-new', facility_id: 'fac-1', error_message: 'push failed' },
    });

    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry recovery/i })).toBeInTheDocument();
    });
  });

  it('shows facility blocking notice during active recovery', async () => {
    (apiService.getGatewayRecoveryStatus as jest.Mock).mockResolvedValue({
      data: { id: 'rec-1', status: 'inventory_push', gateway_id: 'gw-new', facility_id: 'fac-1', inventory_chunks_sent: 2, inventory_chunks_total: 4 },
    });

    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Gateway swap recovery is in progress/i)).toBeInTheDocument();
    });
  });

  it('shows start new recovery after cancelled state', async () => {
    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockResolvedValue({
      data: {
        candidates: [{ gatewayId: 'gw-new', connected: true }],
        recovery: { id: 'rec-1', status: 'cancelled', gateway_id: 'gw-new', facility_id: 'fac-1' },
      },
    });
    (apiService.getGatewayRecoveryStatus as jest.Mock).mockResolvedValue({
      data: { id: 'rec-1', status: 'cancelled', gateway_id: 'gw-new', facility_id: 'fac-1' },
    });

    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start new recovery/i })).toBeInTheDocument();
    });
  });

  it('hides bypass when no swap candidate is connected', async () => {
    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockResolvedValue({
      data: {
        candidates: [],
        recovery: null,
      },
    });
    (apiService.getGatewayRecoveryStatus as jest.Mock).mockResolvedValue({
      data: null,
    });

    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Bypass recovery \(advanced\)/i)).not.toBeInTheDocument();
    });
  });
});
