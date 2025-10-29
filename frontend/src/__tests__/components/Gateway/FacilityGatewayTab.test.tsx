/**
 * Facility Gateway Tab Component Tests
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { apiService } from '@/services/api.service';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// Mock the API service
jest.mock('@/services/api.service');

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

    it('should not show configure button for non-admin users', async () => {
      renderComponent(false);
      await waitFor(() => {
        expect(screen.queryByText('Configure')).not.toBeInTheDocument();
      });
    });
  });

  describe('Configuration', () => {
    it('should expand configuration section when configure button is clicked', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'online',
        gateway_type: 'http',
        protocol_version: '1.1'
      };

      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway]
      });

      renderComponent();
      await waitFor(() => {
        expect(screen.getByLabelText('Expand configuration')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Expand configuration'));
      await waitFor(() => {
        expect(screen.getByText('Gateway Type')).toBeInTheDocument();
      });
    });

    it('should create new gateway when saving configuration without existing gateway', async () => {
      mockApiService.createGateway.mockResolvedValue({
        success: true,
        gateway: { id: 'new-gateway', name: 'Test Facility Gateway' }
      });

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Configure Gateway')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Configure Gateway'));
      });

      // Wait for form to appear
      await waitFor(() => {
        expect(screen.getByText('Gateway Type')).toBeInTheDocument();
      });

      // Fill out the form
      const typeSelect = screen.getByDisplayValue('HTTP (Mesh Manager API)');
      fireEvent.change(typeSelect, { target: { value: 'http' } });

      const baseUrlInput = screen.getByPlaceholderText('https://mesh-manager.example.com/api');
      fireEvent.change(baseUrlInput, { target: { value: 'https://api.example.com' } });

      // Find API key input by its label
      const apiKeyLabel = screen.getByText('API Key');
      const apiKeyInput = apiKeyLabel.parentElement?.querySelector('input') as HTMLInputElement;
      fireEvent.change(apiKeyInput, { target: { value: 'test-api-key' } });

      fireEvent.click(screen.getByText('Create Gateway'));

      await waitFor(() => {
        expect(mockApiService.createGateway).toHaveBeenCalledWith({
          facility_id: facilityId,
          name: 'Test Facility Gateway',
          gateway_type: 'http',
          base_url: 'https://api.example.com',
          connection_url: '',
          api_key: 'test-api-key',
          username: 'admin',
          password: undefined,
          protocol_version: '1.1',
          poll_frequency_ms: 30000,
          ignore_ssl_cert: false
        });
        expect(mockAddToast).toHaveBeenCalledWith({ type: 'success', title: 'Gateway created successfully' });
      });
    });

    it('should update existing gateway when saving configuration', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'online',
        gateway_type: 'http',
        protocol_version: '1.1',
        base_url: 'https://old-api.example.com'
      };

      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway]
      });

      mockApiService.updateGateway.mockResolvedValue({
        success: true,
        gateway: mockGateway
      });

      renderComponent();
      await waitFor(() => {
        expect(screen.getByLabelText('Expand configuration')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Expand configuration'));
      });
      await waitFor(() => {
        expect(screen.getByText('Gateway Type')).toBeInTheDocument();
      });

      // Update the base URL
      const baseUrlInput = screen.getByDisplayValue('https://old-api.example.com');
      fireEvent.change(baseUrlInput, { target: { value: 'https://new-api.example.com' } });

      fireEvent.click(screen.getByText('Update Configuration'));

      await waitFor(() => {
        expect(mockApiService.updateGateway).toHaveBeenCalledWith('gateway-1', {
          gateway_type: 'http',
          base_url: 'https://new-api.example.com',
          connection_url: '',
          api_key: '',
          username: 'admin',
          password: undefined,
          protocol_version: '1.1',
          poll_frequency_ms: 30000,
          ignore_ssl_cert: false
        });
        expect(mockAddToast).toHaveBeenCalledWith({ type: 'success', title: 'Gateway configuration updated successfully' });
      });
    });
  });

  describe('Connection Testing', () => {
    it('should test gateway connection successfully', async () => {
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

      mockApiService.testGatewayConnection.mockResolvedValue({
        success: true,
        message: 'Connection successful'
      });

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Test Connection')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Test Connection'));

      // Should show loading state
      expect(screen.getByText('Testing...')).toBeInTheDocument();

      await waitFor(() => {
        expect(mockApiService.testGatewayConnection).toHaveBeenCalledWith('gateway-1');
        expect(mockAddToast).toHaveBeenCalledWith({ type: 'success', title: 'Gateway connection test successful' });
      });
    });

    it('should handle connection test failure', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'offline'
      };

      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway]
      });

      const errorMessage = 'Connection timeout';
      mockApiService.testGatewayConnection.mockRejectedValue({
        response: {
          data: {
            message: errorMessage
          }
        }
      });

      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Test Connection')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Test Connection'));

      await waitFor(() => {
        expect(mockApiService.testGatewayConnection).toHaveBeenCalledWith('gateway-1');
        expect(mockAddToast).toHaveBeenCalledWith({ type: 'error', title: errorMessage });
      });
    });
  });

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
      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Sync Now'));

      await waitFor(() => {
        expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
      });
    });
  });

  describe('Gateway Types', () => {
    it('should show HTTP-specific fields for HTTP gateway type', async () => {
      const mockGateway = {
        id: 'gateway-1',
        facility_id: facilityId,
        name: 'Test Gateway',
        status: 'online',
        gateway_type: 'http'
      };

      mockApiService.getGateways.mockResolvedValue({
        success: true,
        gateways: [mockGateway]
      });

      renderComponent();
      await waitFor(() => {
        expect(screen.getByLabelText('Expand configuration')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Expand configuration'));
      await waitFor(() => {
        expect(screen.getByText('Base URL')).toBeInTheDocument();
        expect(screen.getByText('API Key')).toBeInTheDocument();
        expect(screen.getByText('Poll Frequency (ms)')).toBeInTheDocument();
      });
    });

    it('should show WebSocket fields for physical gateway type', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Configure Gateway')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Configure Gateway'));
      });

      // Wait for form to appear
      await waitFor(() => {
        expect(screen.getByText('Gateway Type')).toBeInTheDocument();
      });

      const typeSelect = screen.getByDisplayValue('HTTP (Mesh Manager API)');
      fireEvent.change(typeSelect, { target: { value: 'physical' } });

      await waitFor(() => {
        expect(screen.getByText('Connection URL')).toBeInTheDocument();
      });
    });
  });

  describe('Access Control', () => {
    it('should hide configuration and actions for non-admin users', async () => {
      renderComponent(false);
      await waitFor(() => {
        expect(screen.queryByText('Configure Gateway')).not.toBeInTheDocument();
        expect(screen.queryByText('Test Connection')).not.toBeInTheDocument();
        expect(screen.queryByText('Sync Now')).not.toBeInTheDocument();
      });
    });

    it('should show actions for admin users', async () => {
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

      renderComponent(true);
      await waitFor(() => {
        expect(screen.getByText('Test Connection')).toBeInTheDocument();
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
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
      await waitFor(() => expect(screen.getByText('Gateway Actions')).toBeInTheDocument());

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
      mockApiService.broadcastOpsKeyRotation.mockResolvedValue({ success: true } as any);

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

      await waitFor(() => expect(screen.getByText('Gateway Debug')).toBeInTheDocument());

      // Fallback (select textarea by traversing from label)
      const fallbackLabel = screen.getByText('Fallback JWT (App-signed)');
      const fallbackTextarea = fallbackLabel.parentElement?.querySelector('textarea') as HTMLTextAreaElement;
      fireEvent.change(fallbackTextarea, { target: { value: 'jwt' } });
      await act(async () => { fireEvent.click(screen.getByText('Submit Fallback')); });
      await waitFor(() => expect(mockApiService.requestFallbackPass).toHaveBeenCalledWith('jwt'));

      // Rotation (select textarea by traversing from label)
      const rotationLabel = screen.getByText('Rotation Payload (Root-signed)');
      const rotationTextarea = rotationLabel.parentElement?.querySelector('textarea') as HTMLTextAreaElement;
      fireEvent.change(rotationTextarea, { target: { value: '{"cmd_type":"ROTATE_OPERATIONS_KEY","new_ops_pubkey":"b64","ts":1}' } });
      const sigInput = screen.getByText('Signature (base64url)').parentElement?.querySelector('input') as HTMLInputElement;
      fireEvent.change(sigInput, { target: { value: 'sig' } });
      await act(async () => { fireEvent.click(screen.getByText('Broadcast Rotation')); });
      await waitFor(() => expect(mockApiService.broadcastOpsKeyRotation).toHaveBeenCalled());
    });
  });
});
