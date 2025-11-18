/**
 * Facility Gateway Tab Component Tests
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { apiService } from '@/services/api.service';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { getWsBaseUrl } from '@/services/appConfig';

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

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Test Gateway')).toBeInTheDocument();
      });

      expect(screen.getAllByText('wss://api.backend.com/ws/gateway')[0]).toBeInTheDocument();

      const copyButtons = screen.getAllByRole('button', { name: /copy websocket url/i });
      fireEvent.click(copyButtons[0]);

      await waitFor(() => {
        expect((navigator.clipboard as any).writeText).toHaveBeenCalledWith('wss://api.backend.com/ws/gateway');
        expect(mockAddToast).toHaveBeenCalledWith({ type: 'success', title: 'Copied WebSocket URL' });
      });
    });
  });

  const renderComponent = (canManageGateway = true) => {
    // Import component dynamically to avoid issues
    const FacilityGatewayTab = require('@/components/Gateway/FacilityGatewayTab').default;

    return render(
      <WebSocketProvider>
        <FacilityGatewayTab
          facilityId={facilityId}
          facilityName={facilityName}
          canManageGateway={canManageGateway}
        />
      </WebSocketProvider>
    );
  };

  describe('Rendering', () => {
    it('should render loading state initially', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Loading gateway configuration...')).toBeInTheDocument();
      });
    });

    it('should load gateway configuration on mount', async () => {
      renderComponent();
      await waitFor(() => {
        expect(mockApiService.getGateways).toHaveBeenCalledWith({ facility_id: facilityId });
      });
    });

    it('should render no gateway message when no gateway exists', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('No Gateway Configured')).toBeInTheDocument();
      });
    });

    it('should render gateway status when gateway exists', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'online',
        gateway_type: 'http',
        protocol_version: '1.1',
        ip_address: '192.168.1.100'
      };

      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway]
      });

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Test Gateway')).toBeInTheDocument();
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

      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway]
      });

      mockApiService.syncGateway.mockResolvedValue({
        success: true,
        message: 'Gateway synchronization completed successfully'
      });

      renderComponent();
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

      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway]
      });

      const errorMessage = 'Sync failed: Network error';
      mockApiService.syncGateway.mockRejectedValue({
        response: {
          data: {
            message: errorMessage,
            error: 'Connection timeout'
          }
        }
      });

      renderComponent();
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

      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway]
      });

      mockApiService.syncGateway.mockResolvedValue({
        success: true,
        message: 'Sync completed'
      });

      renderComponent();
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
      mockApiService.getGateways.mockResolvedValue({ success: true, gateways: [mockGateway] } as any);
      mockApiService.getSecureTimeSyncPacket.mockResolvedValue({ success: true, timeSyncPacket: [{ ts: 1, cmd_type: 'SECURE_TIME_SYNC' }, 'sig'] } as any);
      mockApiService.requestTimeSyncForLock.mockResolvedValue({ success: true, timeSyncPacket: [{ ts: 2, cmd_type: 'SECURE_TIME_SYNC' }, 'sig'] } as any);

      renderComponent();
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
      mockApiService.getGateways.mockResolvedValue({ success: true, gateways: [mockGateway] } as any);
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
      const { useAuth } = require('@/contexts/AuthContext') as { useAuth: jest.Mock };
      useAuth.mockReturnValue({ authState: { user: { id: 'test-user', role: 'dev_admin' } } });

      const FacilityGatewayTab = require('@/components/Gateway/FacilityGatewayTab').default;
      render(
        <WebSocketProvider>
          <FacilityGatewayTab
            facilityId={facilityId}
            facilityName={facilityName}
            canManageGateway={true}
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
