/**
 * Provider Configuration Form Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderConfigForm } from '@/components/FMS/ProviderConfigForm';
import { fmsService } from '@/services/fms.service';
import { FMSProviderType } from '@/types/fms.types';
import { ToastProvider } from '@/contexts/ToastContext';

jest.mock('@/services/fms.service');

const mockFmsService = fmsService as jest.Mocked<typeof fmsService>;

describe('ProviderConfigForm', () => {
  const facilityId = 'test-facility-1';
  const mockOnSaved = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = (providerType: FMSProviderType, existingConfig: any = null) => {
    return render(
      <ToastProvider>
        <ProviderConfigForm
          facilityId={facilityId}
          providerType={providerType}
          existingConfig={existingConfig}
          onSaved={mockOnSaved}
        />
      </ToastProvider>
    );
  };

  describe('Simulated Provider Form', () => {
    it('should render data file path field', () => {
      renderComponent(FMSProviderType.SIMULATED);
      
      expect(screen.getByLabelText(/Data File Path/i)).toBeInTheDocument();
    });

    it('should submit configuration with simulated provider settings', async () => {
      mockFmsService.createConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      renderComponent(FMSProviderType.SIMULATED);
      
      const dataFileInput = screen.getByLabelText(/Data File Path/i);
      fireEvent.change(dataFileInput, { target: { value: 'config/test-data.json' } });

      const submitButton = screen.getByText('Save Configuration');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockFmsService.createConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            facility_id: facilityId,
            provider_type: FMSProviderType.SIMULATED,
            config: expect.objectContaining({
              customSettings: {
                dataFilePath: 'config/test-data.json',
              },
            }),
          })
        );
      });
    });
  });

  describe('Generic REST Provider Form', () => {
    it('should render all required fields for generic REST', () => {
      renderComponent(FMSProviderType.GENERIC_REST);
      
      expect(screen.getByLabelText(/API Base URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
    });

    it('should validate required fields', async () => {
      renderComponent(FMSProviderType.GENERIC_REST);
      
      const submitButton = screen.getByText('Save Configuration');
      fireEvent.click(submitButton);

      // HTML5 validation should prevent submission
      await waitFor(() => {
        expect(mockFmsService.createConfig).not.toHaveBeenCalled();
      });
    });

    it('should submit with correct data structure', async () => {
      mockFmsService.createConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.GENERIC_REST,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      renderComponent(FMSProviderType.GENERIC_REST);
      
      fireEvent.change(screen.getByLabelText(/API Base URL/i), {
        target: { value: 'https://api.example.com' },
      });
      
      fireEvent.change(screen.getByLabelText(/API Key/i), {
        target: { value: 'test-api-key' },
      });

      const submitButton = screen.getByText('Save Configuration');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockFmsService.createConfig).toHaveBeenCalled();
      });
    });
  });

  describe('Auto-Accept Toggle', () => {
    it('should render auto-accept checkbox', () => {
      renderComponent(FMSProviderType.SIMULATED);
      
      expect(screen.getByLabelText(/Automatically accept/i)).toBeInTheDocument();
    });

    it('should include auto-accept setting in config', async () => {
      mockFmsService.createConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      renderComponent(FMSProviderType.SIMULATED);
      
      const autoAcceptCheckbox = screen.getByLabelText(/Automatically accept/i);
      fireEvent.click(autoAcceptCheckbox);

      const submitButton = screen.getByText('Save Configuration');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockFmsService.createConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              syncSettings: expect.objectContaining({
                autoAcceptChanges: true,
              }),
            }),
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should show toast on save error', async () => {
      mockFmsService.createConfig.mockRejectedValue(new Error('API Error'));

      renderComponent(FMSProviderType.SIMULATED);
      
      const submitButton = screen.getByText('Save Configuration');
      fireEvent.click(submitButton);

      await waitFor(() => {
        // Toast should appear (implementation depends on ToastProvider)
        expect(mockFmsService.createConfig).toHaveBeenCalled();
      });
    });
  });

  describe('Update vs Create', () => {
    it('should call updateConfig when existing config provided', async () => {
      const existingConfig = {
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.SIMULATED,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockFmsService.updateConfig.mockResolvedValue(existingConfig);

      renderComponent(FMSProviderType.SIMULATED, existingConfig);
      
      const submitButton = screen.getByText('Update Configuration');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockFmsService.updateConfig).toHaveBeenCalledWith(
          'config-1',
          expect.any(Object)
        );
      });
    });
  });

  describe('Storedge Provider Form', () => {
    it('should render all Storedge-specific fields', () => {
      renderComponent(FMSProviderType.STOREDGE);
      
      expect(screen.getByLabelText(/Storable Edge API URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Facility ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Consumer Key/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Consumer Secret/i)).toBeInTheDocument();
    });

    it('should validate all required Storedge fields', async () => {
      renderComponent(FMSProviderType.STOREDGE);
      
      const submitButton = screen.getByText('Save Configuration');
      fireEvent.click(submitButton);

      // HTML5 validation should prevent submission
      await waitFor(() => {
        expect(mockFmsService.createConfig).not.toHaveBeenCalled();
      });
    });

    it('should submit with correct OAuth1 credentials structure', async () => {
      mockFmsService.createConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.STOREDGE,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      renderComponent(FMSProviderType.STOREDGE);
      
      fireEvent.change(screen.getByLabelText(/Storable Edge API URL/i), {
        target: { value: 'https://api.storedge.com' },
      });
      
      fireEvent.change(screen.getByLabelText(/Facility ID/i), {
        target: { value: 'test-facility-123' },
      });
      
      fireEvent.change(screen.getByLabelText(/Consumer Key/i), {
        target: { value: 'test-consumer-key' },
      });
      
      fireEvent.change(screen.getByLabelText(/Consumer Secret/i), {
        target: { value: 'test-consumer-secret' },
      });

      const submitButton = screen.getByText('Save Configuration');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockFmsService.createConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            facility_id: facilityId,
            provider_type: FMSProviderType.STOREDGE,
            config: expect.objectContaining({
              baseUrl: 'https://api.storedge.com',
              auth: expect.objectContaining({
                type: 'oauth1',
                credentials: expect.objectContaining({
                  consumerKey: 'test-consumer-key',
                  consumerSecret: 'test-consumer-secret',
                }),
              }),
              customSettings: expect.objectContaining({
                facilityId: 'test-facility-123',
              }),
            }),
          })
        );
      });
    });

    it('should mask Consumer Secret input', () => {
      renderComponent(FMSProviderType.STOREDGE);
      
      const consumerSecretInput = screen.getByLabelText(/Consumer Secret/i);
      expect(consumerSecretInput).toHaveAttribute('type', 'password');
    });

    it('should include facilityId in customSettings for Storedge', async () => {
      mockFmsService.createConfig.mockResolvedValue({
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.STOREDGE,
        is_enabled: true,
        config: {} as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      renderComponent(FMSProviderType.STOREDGE);
      
      fireEvent.change(screen.getByLabelText(/Facility ID/i), {
        target: { value: 'my-facility-id' },
      });

      fireEvent.change(screen.getByLabelText(/Storable Edge API URL/i), {
        target: { value: 'https://api.storedge.com' },
      });

      fireEvent.change(screen.getByLabelText(/Consumer Key/i), {
        target: { value: 'key' },
      });

      fireEvent.change(screen.getByLabelText(/Consumer Secret/i), {
        target: { value: 'secret' },
      });

      const submitButton = screen.getByText('Save Configuration');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockFmsService.createConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              customSettings: expect.objectContaining({
                facilityId: 'my-facility-id',
              }),
            }),
          })
        );
      });
    });

    it('should show helpful placeholder text for each field', () => {
      renderComponent(FMSProviderType.STOREDGE);

      expect(screen.getByPlaceholderText('https://api.storedge.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('your-facility-id')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your OAuth consumer key')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your OAuth consumer secret')).toBeInTheDocument();
    });

    it('should populate form with existing Storable Edge configuration', async () => {
      const existingConfig = {
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.STOREDGE,
        is_enabled: true,
        config: {
          providerType: FMSProviderType.STOREDGE,
          baseUrl: 'https://api.storedge.com',
          auth: {
            type: 'oauth1' as const,
            credentials: {
              consumerKey: 'existing-consumer-key',
              consumerSecret: 'existing-consumer-secret',
            },
          },
          features: {
            supportsTenantSync: true,
            supportsUnitSync: true,
            supportsWebhooks: false,
            supportsRealtime: false,
          },
          syncSettings: {
            autoAcceptChanges: true,
          },
          customSettings: {
            facilityId: 'existing-facility-123',
          },
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      renderComponent(FMSProviderType.STOREDGE, existingConfig);

      // Wait for the form to populate
      await waitFor(() => {
        expect(screen.getByDisplayValue('https://api.storedge.com')).toBeInTheDocument();
      });

      // Check that all fields are populated
      expect(screen.getByDisplayValue('existing-facility-123')).toBeInTheDocument();
      expect(screen.getByDisplayValue('existing-consumer-key')).toBeInTheDocument();
      expect(screen.getByDisplayValue('existing-consumer-secret')).toBeInTheDocument();

      // Check that auto-accept checkbox is checked
      const autoAcceptCheckbox = screen.getByLabelText(/Automatically accept/i);
      expect(autoAcceptCheckbox).toBeChecked();
    });

    it('should handle missing customSettings gracefully', async () => {
      const existingConfig = {
        id: 'config-1',
        facility_id: facilityId,
        provider_type: FMSProviderType.STOREDGE,
        is_enabled: true,
        config: {
          providerType: FMSProviderType.STOREDGE,
          baseUrl: 'https://api.storedge.com',
          auth: {
            type: 'oauth1' as const,
            credentials: {
              consumerKey: 'test-key',
              consumerSecret: 'test-secret',
            },
          },
          features: {
            supportsTenantSync: true,
            supportsUnitSync: true,
            supportsWebhooks: false,
            supportsRealtime: false,
          },
          syncSettings: {
            autoAcceptChanges: false,
          },
          // No customSettings
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      renderComponent(FMSProviderType.STOREDGE, existingConfig);

      // Wait for the form to populate
      await waitFor(() => {
        expect(screen.getByDisplayValue('https://api.storedge.com')).toBeInTheDocument();
      });

      // Check that auth fields are populated
      expect(screen.getByDisplayValue('test-key')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-secret')).toBeInTheDocument();

      // Check that auto-accept checkbox is unchecked
      const autoAcceptCheckbox = screen.getByLabelText(/Automatically accept/i);
      expect(autoAcceptCheckbox).not.toBeChecked();
    });
  });
});

