/**
 * Storedge Provider Tests
 * 
 * Tests the Storedge FMS provider with OAuth 1.0a authentication
 */

import { StoredgeProvider } from '@/services/fms/providers/storedge-provider';
import { FMSProviderType, FMSAuthType } from '@/types/fms.types';

// Mock fetch globally
global.fetch = jest.fn();

describe('StoredgeProvider', () => {
  let provider: StoredgeProvider;
  const facilityId = 'test-facility-123';
  const baseUrl = 'https://api.storedge.com';
  const consumerKey = 'test-consumer-key';
  const consumerSecret = 'test-consumer-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    
    const config = {
      providerType: FMSProviderType.STOREDGE,
      baseUrl,
      auth: {
        type: FMSAuthType.OAUTH1,
        credentials: {
          consumerKey,
          consumerSecret,
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
      customSettings: {
        facilityId,
      },
    };

    provider = new StoredgeProvider(facilityId, config);
  });

  describe('Provider Metadata', () => {
    it('should return correct provider name', () => {
      expect(provider.getProviderName()).toBe('Storable Edge');
    });

    it('should return correct capabilities', () => {
      const capabilities = provider.getCapabilities();
      
      expect(capabilities.supportsTenantSync).toBe(true);
      expect(capabilities.supportsUnitSync).toBe(true);
      expect(capabilities.supportsWebhooks).toBe(false);
      expect(capabilities.supportsRealtime).toBe(false);
      expect(capabilities.supportsLeaseManagement).toBe(true);
      expect(capabilities.supportsPaymentIntegration).toBe(false);
      expect(capabilities.supportsBulkOperations).toBe(false);
    });
  });

  describe('Connection Testing', () => {
    it('should return true when connection test succeeds', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ units: [] }),
      });

      const result = await provider.testConnection();
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/${facilityId}/units`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should return false when connection test fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.testConnection();
      
      expect(result).toBe(false);
    });

    it('should include OAuth headers in connection test', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ units: [] }),
      });

      await provider.testConnection();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;
      
      // OAuth headers should be present
      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toContain('OAuth');
    });
  });

  describe('Fetch Tenants', () => {
    it('should fetch tenants with current ledgers', async () => {
      const mockLedgersResponse = {
        ledgers: [
          {
            tenant: { id: 'tenant-1' },
            unit: { id: 'unit-101' },
          },
          {
            tenant: { id: 'tenant-2' },
            unit: { id: 'unit-202' },
          },
        ],
      };

      const mockTenantsResponse = {
        tenants: [
          {
            id: 'tenant-1',
            email: 'john@example.com',
            first_name: 'John',
            last_name: 'Smith',
            phone_numbers: [
              { number: '555-1234', primary: true },
            ],
            active: true,
          },
          {
            id: 'tenant-2',
            email: 'jane@example.com',
            first_name: 'Jane',
            last_name: 'Doe',
            phone_numbers: [
              { number: '555-5678', primary: true },
            ],
            active: true,
          },
        ],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLedgersResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTenantsResponse,
        });

      const tenants = await provider.fetchTenants();

      expect(tenants).toHaveLength(2);
      
      expect(tenants[0]).toMatchObject({
        externalId: 'tenant-1',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Smith',
        phone: '555-1234',
        unitIds: ['unit-101'],
        status: 'active',
      });

      expect(tenants[1]).toMatchObject({
        externalId: 'tenant-2',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '555-5678',
        unitIds: ['unit-202'],
        status: 'active',
      });

      // Verify both API calls were made
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/${facilityId}/ledgers/current`,
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/${facilityId}/tenants/current`,
        expect.any(Object)
      );
    });

    it('should handle tenant with no primary phone', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ledgers: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            tenants: [{
              id: 'tenant-1',
              email: 'john@example.com',
              first_name: 'John',
              last_name: 'Smith',
              phone_numbers: [],
              active: true,
            }],
          }),
        });

      const tenants = await provider.fetchTenants();

      expect(tenants).toHaveLength(1);
      expect(tenants[0]?.phone).toBeNull();
    });

    it('should handle inactive tenants', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ledgers: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            tenants: [{
              id: 'tenant-1',
              email: 'john@example.com',
              first_name: 'John',
              last_name: 'Smith',
              phone_numbers: [],
              active: false,
            }],
          }),
        });

      const tenants = await provider.fetchTenants();

      expect(tenants).toHaveLength(1);
      expect(tenants[0]?.status).toBe('inactive');
    });
  });

  describe('Fetch Units', () => {
    it('should fetch units and map status correctly', async () => {
      const mockUnitsResponse = {
        units: [
          {
            id: 'unit-101',
            name: 'A-101',
            unit_type: { name: 'storage' },
            size: '10x10',
            status: 'occupied',
            current_tenant_id: 'tenant-1',
            price: 150.00,
          },
          {
            id: 'unit-102',
            name: 'A-102',
            unit_type: { name: 'climate_controlled' },
            size: '10x15',
            status: 'vacant',
            current_tenant_id: null,
            price: 200.00,
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUnitsResponse,
      });

      const units = await provider.fetchUnits();

      expect(units).toHaveLength(2);
      
      expect(units[0]).toMatchObject({
        externalId: 'unit-101',
        unitNumber: 'A-101',
        unitType: 'storage',
        size: '10x10',
        status: 'occupied',
        tenantId: 'tenant-1',
        monthlyRate: 150.00,
      });

      // Vacant status should be mapped to available
      expect(units[1]).toMatchObject({
        externalId: 'unit-102',
        unitNumber: 'A-102',
        unitType: 'climate_controlled',
        size: '10x15',
        status: 'available',
        tenantId: null,
        monthlyRate: 200.00,
      });
    });

    it('should call correct API endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ units: [] }),
      });

      await provider.fetchUnits();

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/${facilityId}/units`,
        expect.any(Object)
      );
    });
  });

  describe('Fetch Individual Tenant', () => {
    it('should fetch specific tenant by external ID', async () => {
      const mockTenant = {
        id: 'tenant-1',
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Smith',
        phone_numbers: [{ number: '555-1234', primary: true }],
        active: true,
      };

      const mockLedgers = {
        ledgers: [{
          tenant: { id: 'tenant-1' },
          unit: { id: 'unit-101' },
        }],
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTenant,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLedgers,
        });

      const tenant = await provider.fetchTenant('tenant-1');

      expect(tenant).not.toBeNull();
      expect(tenant).toMatchObject({
        externalId: 'tenant-1',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Smith',
        phone: '555-1234',
        unitIds: ['unit-101'],
        status: 'active',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/${facilityId}/tenants/tenant-1`,
        expect.any(Object)
      );
    });

    it('should return null when tenant fetch fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

      const tenant = await provider.fetchTenant('nonexistent');

      expect(tenant).toBeNull();
    });
  });

  describe('Fetch Individual Unit', () => {
    it('should fetch specific unit by external ID', async () => {
      const mockUnit = {
        id: 'unit-101',
        name: 'A-101',
        unit_type: { name: 'storage' },
        size: '10x10',
        status: 'occupied',
        current_tenant_id: 'tenant-1',
        price: 150.00,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUnit,
      });

      const unit = await provider.fetchUnit('unit-101');

      expect(unit).not.toBeNull();
      expect(unit).toMatchObject({
        externalId: 'unit-101',
        unitNumber: 'A-101',
        unitType: 'storage',
        size: '10x10',
        status: 'occupied',
        tenantId: 'tenant-1',
        monthlyRate: 150.00,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/${facilityId}/units/unit-101`,
        expect.any(Object)
      );
    });

    it('should return null when unit fetch fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

      const unit = await provider.fetchUnit('nonexistent');

      expect(unit).toBeNull();
    });

    it('should map vacant status to available', async () => {
      const mockUnit = {
        id: 'unit-102',
        name: 'A-102',
        unit_type: { name: 'storage' },
        size: '10x10',
        status: 'vacant',
        current_tenant_id: null,
        price: 150.00,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockUnit,
      });

      const unit = await provider.fetchUnit('unit-102');

      expect(unit?.status).toBe('available');
    });
  });

  describe('Webhook Support', () => {
    it('should return false for webhook validation (not supported)', async () => {
      const payload: any = { event_type: 'lease.started', data: {} };
      const signature = 'test-signature';

      const isValid = await provider.validateWebhook(payload, signature);

      expect(isValid).toBe(false);
    });

    it('should return placeholder webhook payload', async () => {
      const rawPayload = { event_type: 'tenant.created', data: {} };

      const parsed = await provider.parseWebhookPayload(rawPayload);

      expect(parsed.event_type).toBe('lease.started');
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.data).toEqual(rawPayload);
    });
  });

  describe('OAuth 1.0a Authentication', () => {
    it('should include OAuth Authorization header in all requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ units: [] }),
      });

      await provider.fetchUnits();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toContain('OAuth');
      expect(headers.Authorization).toContain('oauth_consumer_key');
      expect(headers.Authorization).toContain('oauth_signature');
      expect(headers.Authorization).toContain('oauth_nonce');
      expect(headers.Authorization).toContain('oauth_timestamp');
    });

    it('should use HMAC-SHA1 signature method', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ units: [] }),
      });

      await provider.fetchUnits();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const authHeader = fetchCall[1].headers.Authorization;

      expect(authHeader).toContain('oauth_signature_method="HMAC-SHA1"');
    });

    it('should generate unique nonce for each request', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ units: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ units: [] }),
        });

      await provider.fetchUnits();
      await provider.fetchUnits();

      const firstAuthHeader = (global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization;
      const secondAuthHeader = (global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization;

      // Extract nonce values
      const firstNonce = firstAuthHeader.match(/oauth_nonce="([^"]+)"/)?.[1];
      const secondNonce = secondAuthHeader.match(/oauth_nonce="([^"]+)"/)?.[1];

      expect(firstNonce).toBeDefined();
      expect(secondNonce).toBeDefined();
      expect(firstNonce).not.toBe(secondNonce);
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(provider.fetchUnits()).rejects.toThrow('HTTP 401');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

      await expect(provider.fetchUnits()).rejects.toThrow('Network failure');
    });

    it('should handle malformed JSON responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(provider.fetchUnits()).rejects.toThrow('Invalid JSON');
    });
  });

  describe('API URL Construction', () => {
    it('should use correct facility ID in API paths', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ units: [] }),
      });

      await provider.fetchUnits();

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/${facilityId}/units`,
        expect.any(Object)
      );
    });

    it('should construct correct tenant endpoint', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'tenant-1' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ledgers: [] }),
        });

      await provider.fetchTenant('tenant-123');

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/${facilityId}/tenants/tenant-123`,
        expect.any(Object)
      );
    });
  });
});

