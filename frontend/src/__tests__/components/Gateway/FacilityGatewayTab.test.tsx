/**
 * Facility Gateway Tab Component Tests
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { apiService } from '@/services/api.service';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { getWsBaseUrl } from '@/services/appConfig';
import { useAuth } from '@/contexts/AuthContext';
import FacilityGatewayTab from '@/components/Gateway/FacilityGatewayTab';
import type { useFacilityGatewayLiveStatus } from '@/hooks/useFacilityGatewayLiveStatus';

type FacilityGatewayLiveStatus = ReturnType<typeof useFacilityGatewayLiveStatus>;

function createLiveStatus(overrides: Partial<FacilityGatewayLiveStatus> = {}): FacilityGatewayLiveStatus {
  return {
    gateway: null,
    wsConnected: false,
    lastActivityAt: null,
    effectiveStatus: 'offline',
    loading: false,
    reload: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Mock the API service
jest.mock('@/services/api.service');
jest.mock('@/services/appConfig', () => ({
  getWsBaseUrl: jest.fn(() => 'ws://backend.example.com'),
  getApiBaseUrl: jest.fn(() => 'http://localhost:3000'),
}));

// Mock the toast context
const mockAddToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

// Mock the auth context
jest.mock('@/contexts/AuthContext', () => {
  const useAuth = jest.fn(() => ({
    authState: {
      user: {
        id: 'test-user',
        role: 'admin'
      }
    }
  }));
  return { useAuth };
});

const mockApiService = apiService as jest.Mocked<typeof apiService>;
const mockGetWsBaseUrl = getWsBaseUrl as jest.Mock;

describe('FacilityGatewayTab', () => {
  const facilityId = 'test-facility-1';
  const facilityName = 'Test Facility';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockApiService.getGateways.mockResolvedValue({
      success: true,
      gateways: []
    });
    mockApiService.getGatewayReassignmentCandidates.mockResolvedValue({
      success: true,
      gateways: []
    } as any);
    mockApiService.reassignGateway.mockResolvedValue({
      success: true
    } as any);
    mockApiService.getGatewayWsStatus = jest.fn().mockResolvedValue({
      success: true,
      facilityId,
      connected: false,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    });
  });
  describe('WebSocket URL display', () => {
    it('uses backend WebSocket base URL and copies to clipboard', async () => {
      mockGetWsBaseUrl.mockReturnValue('wss://api.backend.com');
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'online',
        gateway_type: 'physical',
      };
      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway],
      });

      renderComponent(true, createLiveStatus({
        gateway: mockGateway as any,
        effectiveStatus: 'online',
        wsConnected: true,
      }));

      // First wait for the gateway to load
      await waitFor(() => {
        expect(screen.getAllByText('Test Gateway').length).toBeGreaterThan(0);
      }, { timeout: 10000 });

      // Now check for the WebSocket URL - it should be on the Overview tab by default
      await waitFor(() => {
        const wsUrlElements = screen.queryAllByText(/\/ws\/gateway/);
        expect(wsUrlElements.length).toBeGreaterThan(0);
      }, { timeout: 10000 });

      // Find and click the copy button
      const copyButtons = screen.getAllByRole('button', { name: /copy websocket url/i });
      fireEvent.click(copyButtons[0]);

      await waitFor(() => {
        expect((navigator.clipboard as any).writeText).toHaveBeenCalled();
        expect(mockAddToast).toHaveBeenCalledWith({ type: 'success', title: 'Copied WebSocket URL' });
      });
    }, 20_000);
  });

  const renderComponent = (
    canManageGateway = true,
    liveStatus: FacilityGatewayLiveStatus = createLiveStatus(),
  ) => {
    return render(
      <WebSocketProvider>
        <FacilityGatewayTab
          facilityId={facilityId}
          facilityName={facilityName}
          canManageGateway={canManageGateway}
          liveStatus={liveStatus}
        />
      </WebSocketProvider>
    );
  };

  describe('Rendering', () => {
    it('should render loading state initially', async () => {
      renderComponent(true, createLiveStatus({ loading: true }));
      await waitFor(() => {
        expect(screen.getByText('Loading gateway configuration...')).toBeInTheDocument();
      });
    });

    it('should render no gateway message when no gateway exists', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('No gateway assigned')).toBeInTheDocument();
        expect(screen.getByText(/Contact BluLok for setup assistance/i)).toBeInTheDocument();
      });
    });

    it('shows inbound WebSocket banner when no gateway row but session is connected', async () => {
      renderComponent(true, createLiveStatus({
        wsConnected: true,
        lastActivityAt: new Date('2025-01-01T12:00:00.000Z').getTime(),
      }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.getByText('WebSocket session active — no gateway assigned yet')).toBeInTheDocument();
        expect(screen.getByText(/does not have a gateway record/i)).toBeInTheDocument();
      });
    });

    it('shows gateway status when a gateway row exists', async () => {
      renderComponent(true, createLiveStatus({
        gateway: {
          id: 'gateway-1',
          facility_id: facilityId,
          name: 'Row Gateway',
          status: 'online',
          gateway_type: 'physical',
        },
        wsConnected: false,
        effectiveStatus: 'offline',
      }));

      await waitFor(() => {
        expect(screen.getByText('Gateway status')).toBeInTheDocument();
        expect(screen.getByText('offline')).toBeInTheDocument();
        expect(screen.getAllByText('Row Gateway').length).toBeGreaterThan(0);
      });
    });

    it('should render assignment controls for admin when no gateway exists', async () => {
      mockApiService.getGatewayReassignmentCandidates.mockResolvedValue({
        success: true,
        gateways: [
          {
            id: 'gateway-2',
            facility_id: 'facility-2',
            name: 'Candidate Gateway',
            status: 'online',
          },
        ],
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Assign Gateway' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Assign Gateway' })).toBeInTheDocument();
      });
    });

    it('should render replace controls for admin when gateway exists', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Current Gateway',
        status: 'online',
        gateway_type: 'http',
      };

      mockApiService.getGatewayReassignmentCandidates.mockResolvedValue({
        success: true,
        gateways: [{ id: 'gateway-3', facility_id: null, name: 'Unassigned Gateway', status: 'online' }],
      } as any);

      renderComponent(true, createLiveStatus({ gateway: mockGateway as any, effectiveStatus: 'online' }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Replace Gateway' })).toBeInTheDocument();
        expect(screen.getByText(/Current gateway:/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Replace Gateway' })).toBeInTheDocument();
      });
    });

    it('shows online when websocket session is active for physical gateway', async () => {
      renderComponent(true, createLiveStatus({
        gateway: {
          id: 'gateway-1',
          facility_id: facilityId,
          name: 'Test Gateway',
          status: 'offline',
          gateway_type: 'physical',
          ip_address: '192.168.1.100',
        },
        wsConnected: true,
        effectiveStatus: 'online',
        lastActivityAt: Date.now(),
      }));
      await waitFor(() => {
        expect(screen.getAllByText('Test Gateway').length).toBeGreaterThan(0);
        expect(screen.getByText('online')).toBeInTheDocument();
      });
    });

    it('should render tabs for non-admin users', async () => {
      renderComponent(false);
      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeInTheDocument();
        expect(screen.getByText('Sync')).toBeInTheDocument();
        expect(screen.getByText('DevTools/Diag')).toBeInTheDocument();
      });
    });
  });

  // Connection testing UI removed in the simplified Setup tab; skip those tests

  describe('Sync Now', () => {
    it('should perform manual sync successfully', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'online'
      };

      mockApiService.syncGateway.mockResolvedValue({
        success: true,
        message: 'Gateway synchronization completed successfully'
      });

      renderComponent(true, createLiveStatus({ gateway: mockGateway as any, effectiveStatus: 'online' }));
      // Wait for gateway to load, then navigate to Sync tab
      await waitFor(() => {
        expect(screen.getByText('Sync')).toBeInTheDocument();
      });

      // Click the Sync tab
      const syncTab = screen.getByText('Sync');
      await act(async () => { fireEvent.click(syncTab); });

      // Now Sync Now button should be visible
      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Sync Now'));

      // Should show loading state
      expect(screen.getByText('Syncing...')).toBeInTheDocument();

      await waitFor(() => {
        expect(mockApiService.syncGateway).toHaveBeenCalledWith('gateway-1');
        expect(mockAddToast).toHaveBeenCalledWith({ type: 'success', title: 'Gateway synchronization completed' });
        expect(screen.getByText('Starting manual gateway synchronization...')).toBeInTheDocument();
        expect(screen.getByText('Gateway synchronization completed successfully')).toBeInTheDocument();
      });
    });

    it('should handle sync failure', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'error'
      };

      const errorMessage = 'Sync failed: Network error';
      mockApiService.syncGateway.mockRejectedValue({
        response: {
          data: {
            message: errorMessage,
            error: 'Connection timeout'
          }
        }
      });

      renderComponent(true, createLiveStatus({ gateway: mockGateway as any, effectiveStatus: 'error' }));
      // Wait for gateway to load, then navigate to Sync tab
      await waitFor(() => {
        expect(screen.getByText('Sync')).toBeInTheDocument();
      });

      // Click the Sync tab
      const syncTab = screen.getByText('Sync');
      await act(async () => { fireEvent.click(syncTab); });

      // Now Sync Now button should be visible
      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Sync Now'));

      await waitFor(() => {
        expect(mockApiService.syncGateway).toHaveBeenCalledWith('gateway-1');
        expect(mockAddToast).toHaveBeenCalledWith({ type: 'error', title: errorMessage });
        expect(screen.getByText('Starting manual gateway synchronization...')).toBeInTheDocument();
        // Error details are logged in sync logs; toast assertion above is sufficient
      });
    });

    it('should display last sync time after successful sync', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'online',
        last_seen: new Date().toISOString()
      };

      mockApiService.syncGateway.mockResolvedValue({
        success: true,
        message: 'Sync completed'
      });

      renderComponent(true, createLiveStatus({ gateway: mockGateway as any, effectiveStatus: 'online' }));
      // Wait for gateway to load, then navigate to Sync tab
      await waitFor(() => {
        expect(screen.getByText('Sync')).toBeInTheDocument();
      });

      // Click the Sync tab
      const syncTab = screen.getByText('Sync');
      await act(async () => { fireEvent.click(syncTab); });

      // Now Sync Now button should be visible
      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Sync Now'));

      await waitFor(() => {
        expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
      });
    });
  });

  describe('Gateway Actions', () => {
    it('should invoke time sync endpoints', async () => {
      const mockGateway = { id: 'gateway-1', facility_id: facilityId, name: 'GW', status: 'online', gateway_type: 'http', protocol_version: '1.1' } as any;
      mockApiService.getSecureTimeSyncPacket.mockResolvedValue({ success: true, timeSyncPacket: [{ ts: 1, cmd_type: 'SECURE_TIME_SYNC' }, 'sig'] } as any);
      mockApiService.requestTimeSyncForLock.mockResolvedValue({ success: true, timeSyncPacket: [{ ts: 2, cmd_type: 'SECURE_TIME_SYNC' }, 'sig'] } as any);

      renderComponent(true, createLiveStatus({ gateway: mockGateway, effectiveStatus: 'online' }));
      // Wait for gateway to load, then click DevTools/Diag tab
      await waitFor(() => {
        expect(screen.getByText('DevTools/Diag')).toBeInTheDocument();
      });

      // Click the DevTools/Diag tab to navigate to it
      const devToolsTab = screen.getByText('DevTools/Diag');
      await act(async () => { fireEvent.click(devToolsTab); });

      // Now look for Secure Time Sync instead of Gateway Actions
      await waitFor(() => expect(screen.getByText('Secure Time Sync')).toBeInTheDocument());

      // Get Secure Time
      const getBtn = screen.getByText('Get Secure Time');
      await act(async () => { fireEvent.click(getBtn); });
      await waitFor(() => expect(mockApiService.getSecureTimeSyncPacket).toHaveBeenCalled());

      // Request Time Sync (Lock)
      const reqBtn = screen.getByText('Request Time Sync (Lock)');
      const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('lock-1');
      await act(async () => { fireEvent.click(reqBtn); });
      promptSpy.mockRestore();
      await waitFor(() => expect(mockApiService.requestTimeSyncForLock).toHaveBeenCalledWith('lock-1'));
    });

    it('should submit fallback and rotation from debug panel', async () => {
      const mockGateway = { id: 'gateway-1', facility_id: facilityId, name: 'GW', status: 'online', gateway_type: 'http', protocol_version: '1.1' } as any;
      mockApiService.requestFallbackPass.mockResolvedValue({ success: true } as any);
      mockApiService.rotateOpsKey.mockResolvedValue({
        payload: { cmd_type: 'ROTATE_OPERATIONS_KEY', new_ops_pubkey: 'pub', ts: 1700000000 },
        signature: 'sig',
        generated_ops_key_pair: {
          private_key_b64: 'priv',
          public_key_b64: 'pub',
        },
      } as any);

      // Elevate role to dev_admin for this test so rotation button is visible
      (useAuth as jest.MockedFunction<typeof useAuth>).mockReturnValue({
        authState: { user: { id: 'test-user', role: 'dev_admin' } },
      } as ReturnType<typeof useAuth>);
      render(
        <WebSocketProvider>
          <FacilityGatewayTab
            facilityId={facilityId}
            facilityName={facilityName}
            canManageGateway={true}
            liveStatus={createLiveStatus({ gateway: mockGateway, effectiveStatus: 'online' })}
          />
        </WebSocketProvider>
      );

      // Wait for gateway to load, then click DevTools/Diag tab
      await waitFor(() => {
        expect(screen.getByText('DevTools/Diag')).toBeInTheDocument();
      });

      // Click the DevTools/Diag tab to navigate to it
      const devToolsTab = screen.getByText('DevTools/Diag');
      await act(async () => { fireEvent.click(devToolsTab); });

      await waitFor(() => expect(screen.getByText('Gateway Debug')).toBeInTheDocument());

      // Fallback (select textarea by traversing from label)
      const fallbackLabel = screen.getByText('Fallback JWT (App-signed)');
      const fallbackTextarea = fallbackLabel.parentElement?.querySelector('textarea') as HTMLTextAreaElement;
      fireEvent.change(fallbackTextarea, { target: { value: 'jwt' } });
      await act(async () => { fireEvent.click(screen.getByText('Submit Fallback')); });
      await waitFor(() => expect(mockApiService.requestFallbackPass).toHaveBeenCalledWith('jwt'));

      // Rotation flow (new managed UI)
      const rootKeyLabel = screen.getByText('Root Private Key (base64url, 32-byte)');
      const rootKeyTextarea = rootKeyLabel.parentElement?.querySelector('textarea') as HTMLTextAreaElement;
      fireEvent.change(rootKeyTextarea, { target: { value: 'root-key' } });

      const rotateButton = screen.getByText('Rotate Ops Key');
      await act(async () => { fireEvent.click(rotateButton); });

      await waitFor(() => expect(screen.getByText('Confirm Operations Key Rotation')).toBeInTheDocument());

      const modalRotateBtn = screen.getAllByRole('button', { name: 'Rotate Ops Key' }).pop() as HTMLElement;
      await act(async () => { fireEvent.click(modalRotateBtn); });

      await waitFor(() => {
        expect(mockApiService.rotateOpsKey).toHaveBeenCalledWith({
          rootPrivateKeyB64: 'root-key',
          customOpsPublicKeyB64: undefined,
        });
        expect(screen.getByText('Ops Key Rotation Broadcasted')).toBeInTheDocument();
        expect(screen.getByText('OPS_ED25519_PRIVATE_KEY_B64')).toBeInTheDocument();
      });
    });
  });
});
