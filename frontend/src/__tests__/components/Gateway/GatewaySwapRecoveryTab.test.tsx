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
        productionFirmwareVersion: '2.0.0',
        candidateFirmwareVersion: '1.0.0',
        candidateMatchesProduction: false,
        productionFirmwareImageAvailable: true,
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
      expect(screen.getByText(/Replacement gateway detected/i)).toBeInTheDocument();
    });
  });

  it('renders phased recovery stepper labels during active push', async () => {
    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockResolvedValue({
      data: {
        candidates: [{ gatewayId: 'gw-new', connected: true }],
        recovery: {
          id: 'rec-1',
          status: 'inventory_push',
          gateway_id: 'gw-new',
          facility_id: 'fac-1',
          inventory_chunks_sent: 1,
          inventory_chunks_total: 4,
        },
      },
    });
    (apiService.getGatewayRecoveryStatus as jest.Mock).mockResolvedValue({
      data: {
        id: 'rec-1',
        status: 'inventory_push',
        gateway_id: 'gw-new',
        facility_id: 'fac-1',
        inventory_chunks_sent: 1,
        inventory_chunks_total: 4,
      },
    });

    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(screen.getByText('Firmware')).toBeInTheDocument();
      expect(screen.getByText('Inventory Push')).toBeInTheDocument();
    });
    expect(screen.queryByText('Provisioning')).not.toBeInTheDocument();
  });

  it('does not resurrect completion on mount and offers a fresh swap to the available candidate', async () => {
    (apiService.getGatewayRecoveryCandidates as jest.Mock).mockResolvedValue({
      data: {
        candidates: [],
        sessions: [
          { gatewayId: 'gw-new', sessionRole: 'active', connected: true },
          { gatewayId: 'gw-old', sessionRole: 'swap_candidate', connected: true },
        ],
        recovery: {
          id: 'rec-1',
          status: 'complete',
          gateway_id: 'gw-new',
          previous_gateway_id: 'gw-old',
          facility_id: 'fac-1',
        },
      },
    });
    (apiService.getGatewayRecoveryStatus as jest.Mock).mockResolvedValue({
      data: {
        id: 'rec-1',
        status: 'complete',
        gateway_id: 'gw-new',
        previous_gateway_id: 'gw-old',
        facility_id: 'fac-1',
      },
    });

    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-new" wsConnected />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Replacement gateway detected/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Start swap/i })).toBeInTheDocument();
    });
    // Completion is session-only — a persisted complete recovery must not show on mount.
    expect(screen.queryByText(/Gateway swap complete/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Swap back/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
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

  it('shows firmware matching checkbox before start', async () => {
    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(screen.getByText('Include firmware matching')).toBeInTheDocument();
    });
    expect(screen.queryByText('Firmware image')).not.toBeInTheDocument();
  });

  it('allows start swap when candidate matches production even without catalogued firmware image', async () => {
    (apiService.getGatewayRecoveryOptions as jest.Mock).mockResolvedValue({
      data: {
        productionFirmwareVersion: '1.0.9-SNAPSHOT-15-3',
        candidateFirmwareVersion: '1.0.9-SNAPSHOT-15-3',
        candidateMatchesProduction: true,
        productionFirmwareImageAvailable: false,
      },
    });

    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Candidate already matches production/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/No firmware image is catalogued for the production version/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start swap/i })).toBeEnabled();
  });

  it('blocks start swap when candidate is behind production and no catalogued firmware image', async () => {
    (apiService.getGatewayRecoveryOptions as jest.Mock).mockResolvedValue({
      data: {
        productionFirmwareVersion: '2.0.0',
        candidateFirmwareVersion: '1.0.0',
        candidateMatchesProduction: false,
        productionFirmwareImageAvailable: false,
      },
    });

    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No firmware image is catalogued for the production version/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Start swap/i })).toBeDisabled();
  });

  it('shows bypass option while recovery is detected', async () => {
    render(
      <GatewaySwapRecoveryTab facilityId="fac-1" boundGatewayId="gw-old" wsConnected />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Bypass swap \(advanced\)/i)).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /retry swap/i })).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /Start swap/i })).toBeInTheDocument();
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
      expect(screen.queryByText(/Bypass swap \(advanced\)/i)).not.toBeInTheDocument();
    });
  });
});
