/**
 * FMS Tab Component Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FacilityFMSTab } from '@/components/FMS/FacilityFMSTab';
import { fmsService } from '@/services/fms.service';
import { FMSProviderType, FMSSyncStatus } from '@/types/fms.types';
import { ToastProvider } from '@/contexts/ToastContext';
import ToastContainer from '@/components/Toast/ToastContainer';
import { FMSSyncProvider } from '@/contexts/FMSSyncContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

// Mock the FMS service
jest.mock('@/services/fms.service');

const mockFmsService = fmsService as jest.Mocked<typeof fmsService>;

describe('FacilityFMSTab', () => {
  const facilityId = 'test-facility-1';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    mockFmsService.getConfig.mockResolvedValue(null);
    mockFmsService.getSyncHistory.mockResolvedValue({ logs: [], total: 0 });
  });

  const renderComponent = (isDevMode = false, canEditFMS = true) => {
    return render(
      <WebSocketProvider>
        <ToastProvider>
          <ToastContainer />
          <FMSSyncProvider>
            <FacilityFMSTab facilityId={facilityId} isDevMode={isDevMode} canEditFMS={canEditFMS} />
          </FMSSyncProvider>
        </ToastProvider>
      </WebSocketProvider>
    );
  };

  describe('Rendering', () => {
    it('should render loading state initially', () => {
      renderComponent();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should load configuration on mount', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(mockFmsService.getConfig).toHaveBeenCalledWith(facilityId);
      });
    });

    it('should load sync history on mount', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(mockFmsService.getSyncHistory).toHaveBeenCalledWith(facilityId, { limit: 10 });
      });
    });
  });

  describe('Provider Selection', () => {
    it('should show provider selection when no config exists', async () => {
      renderComponent();

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });

      // Configuration should auto-expand when no config exists
      await waitFor(() => {
        expect(screen.getByText('Select FMS Provider')).toBeInTheDocument();
        expect(screen.getByLabelText('Collapse configuration')).toBeInTheDocument();
      });
    });

    it('should not show simulated provider when dev mode is off', async () => {
      renderComponent(false);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });

      // Configuration should auto-expand when no config exists
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).not.toHaveTextContent('Simulated Provider');
      });
    });

    it('should show simulated provider when dev mode is on', async () => {
      renderComponent(true);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });

      // Configuration should auto-expand when no config exists
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        fireEvent.click(select);
        expect(screen.getByText(/Simulated Provider/i)).toBeInTheDocument();
      });
    });
  });

  describe('Configuration Display', () => {
    it('should display existing configuration', async () => {
      mockFmsService.getConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        is_enabled: true,
        config: {} as any,
        last_sync_at: new Date().toISOString(),
        last_sync_status: FMSSyncStatus.COMPLETED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText(/Configured:/i)).toBeInTheDocument();
        expect(screen.getByText(/Sync Operations/i)).toBeInTheDocument();
      });
    });

    it('should show sync button when configured and enabled', async () => {
      mockFmsService.getConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Sync Now')).toBeInTheDocument();
      });
    });
  });

  describe('Sync Operations', () => {
    beforeEach(() => {
      mockFmsService.getConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    it('should trigger sync when sync button clicked', async () => {
      mockFmsService.triggerSync.mockResolvedValue({
        success: true,
        syncLogId: 'sync-1',
        changesDetected: [],
        summary: {
          tenantsAdded: 0,
          tenantsRemoved: 0,
          tenantsUpdated: 0,
          unitsAdded: 0,
          unitsRemoved: 0,
          unitsUpdated: 0,
          errors: [],
          warnings: [],
        },
        requiresReview: false,
      });

      renderComponent();

      await waitFor(() => screen.getByText('Sync Now'));

      const syncButton = screen.getByText('Sync Now');
      fireEvent.click(syncButton);

      await waitFor(() => {
        expect(mockFmsService.triggerSync).toHaveBeenCalledWith(facilityId);
      });
    });

    it('should show pending changes alert when changes detected', async () => {
      mockFmsService.triggerSync.mockResolvedValue({
        success: true,
        syncLogId: 'sync-1',
        changesDetected: [
          {
            id: 'change-1',
            sync_log_id: 'sync-1',
            change_type: 'tenant_added' as any,
            entity_type: 'tenant',
            external_id: 'ext-1',
            after_data: {},
            required_actions: [],
            impact_summary: 'New tenant added',
            is_reviewed: false,
            created_at: new Date().toISOString(),
          },
        ],
        summary: {
          tenantsAdded: 1,
          tenantsRemoved: 0,
          tenantsUpdated: 0,
          unitsAdded: 0,
          unitsRemoved: 0,
          unitsUpdated: 0,
          errors: [],
          warnings: [],
        },
        requiresReview: true,
      });

      renderComponent();

      await waitFor(() => screen.getByText('Sync Now'));

      const syncButton = screen.getByText('Sync Now');
      fireEvent.click(syncButton);

      await waitFor(() => {
        // Check for pending changes alert
        expect(screen.getByText('1 changes pending review')).toBeInTheDocument();
      });
    });
  });

  describe('Test Connection', () => {
    beforeEach(() => {
      mockFmsService.getConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    it('should test connection when button clicked', async () => {
      mockFmsService.testConnection.mockResolvedValue(true);

      renderComponent();
      
      // Expand configuration
      await waitFor(() => screen.getByLabelText('Expand configuration'));
      fireEvent.click(screen.getByLabelText('Expand configuration'));

      await waitFor(() => screen.getByText('Test Connection'));
      
      const testButton = screen.getByText('Test Connection');
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(mockFmsService.testConnection).toHaveBeenCalledWith('config-1');
      });
    });
  });

  describe('Sync History', () => {
    it('should display sync history table', async () => {
      mockFmsService.getSyncHistory.mockResolvedValue({
        logs: [
          {
            id: 'log-1',
            facility_id: facilityId,
            fms_config_id: 'config-1',
            sync_status: FMSSyncStatus.COMPLETED,
            started_at: new Date().toISOString(),
            triggered_by: 'manual',
            changes_detected: 5,
            changes_applied: 5,
            changes_pending: 0,
            changes_rejected: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        total: 1,
      });

      mockFmsService.getConfig.mockResolvedValue(null);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Sync History')).toBeInTheDocument();
        // Look for the specific changes detected value in the table
        const table = screen.getByRole('table');
        const changesCell = table.querySelector('td:nth-child(3)'); // Changes column
        expect(changesCell).toHaveTextContent('5');
      });
    });
  });

  describe('Read-only mode for facility managers', () => {
    it('should show read-only badge and hide expand/collapse button when canEditFMS is false', async () => {
      const mockConfig = {
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        config: {} as any,
        is_enabled: true,
        last_sync_at: new Date().toISOString(),
        last_sync_status: FMSSyncStatus.COMPLETED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockFmsService.getConfig.mockResolvedValue(mockConfig);
      mockFmsService.getSyncHistory.mockResolvedValue({ logs: [], total: 0 });

      renderComponent(false, false); // isDevMode=false, canEditFMS=false

      await waitFor(() => {
        expect(screen.getByText('FMS Configuration')).toBeInTheDocument();
        expect(screen.getByText('Read Only')).toBeInTheDocument();
        expect(screen.queryByLabelText('Expand configuration')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Collapse configuration')).not.toBeInTheDocument();
      });
    });

    it('should show readonly configuration summary in expanded view', async () => {
      const mockConfig = {
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        config: {} as any,
        is_enabled: true,
        last_sync_at: new Date().toISOString(),
        last_sync_status: FMSSyncStatus.COMPLETED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockFmsService.getConfig.mockResolvedValue(mockConfig);
      mockFmsService.getSyncHistory.mockResolvedValue({ logs: [], total: 0 });

      renderComponent(false, false); // canEditFMS=false

      await waitFor(() => {
        expect(screen.getByText('FMS Configuration')).toBeInTheDocument();
        expect(screen.getByText('Simulated Provider')).toBeInTheDocument();
        expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0);
        expect(screen.getByText('Configuration managed by administrators')).toBeInTheDocument();
        // No expand/collapse button should be present
        expect(screen.queryByLabelText('Expand configuration')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Collapse configuration')).not.toBeInTheDocument();
      });
    });

    it('should still allow testing connection in readonly mode', async () => {
      const mockConfig = {
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        config: {} as any,
        is_enabled: true,
        last_sync_at: new Date().toISOString(),
        last_sync_status: FMSSyncStatus.COMPLETED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockFmsService.getConfig.mockResolvedValue(mockConfig);
      mockFmsService.getSyncHistory.mockResolvedValue({ logs: [], total: 0 });
      mockFmsService.testConnection.mockResolvedValue(true);

      renderComponent(false, false); // canEditFMS=false

      await waitFor(() => {
        const testButton = screen.getByText('Test Connection');
        expect(testButton).toBeInTheDocument();
        expect(testButton).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('Test Connection'));

      await waitFor(() => {
        expect(mockFmsService.testConnection).toHaveBeenCalledWith('config-1');
      });
    });
  });
});

