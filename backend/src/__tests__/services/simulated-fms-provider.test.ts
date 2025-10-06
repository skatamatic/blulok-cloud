/**
 * Simulated FMS Provider Tests
 * 
 * Tests the simulated provider used for testing and demos
 */

import { SimulatedProvider } from '@/services/fms/providers/simulated-provider';
import { FMSProviderType } from '@/types/fms.types';
import * as fs from 'fs';
import * as path from 'path';

describe('SimulatedProvider', () => {
  let provider: SimulatedProvider;
  const facilityId = '550e8400-e29b-41d4-a716-446655440001';
  const testDataPath = path.join(__dirname, 'test-fms-data.json');

  const createTestDataFile = (data: any) => {
    fs.writeFileSync(testDataPath, JSON.stringify(data, null, 2));
  };

  const cleanupTestFile = () => {
    if (fs.existsSync(testDataPath)) {
      fs.unlinkSync(testDataPath);
    }
  };

  beforeEach(() => {
    const config = {
      providerType: FMSProviderType.SIMULATED,
      auth: { type: 'api_key' as const, credentials: {} },
      features: {
        supportsTenantSync: true,
        supportsUnitSync: true,
        supportsWebhooks: true,
        supportsRealtime: false,
      },
      syncSettings: {
        autoAcceptChanges: false,
      },
      customSettings: {
        dataFilePath: testDataPath,
      },
    };

    provider = new SimulatedProvider(facilityId, config);
  });

  afterEach(() => {
    cleanupTestFile();
  });

  describe('Provider Metadata', () => {
    it('should return correct provider name', () => {
      expect(provider.getProviderName()).toBe('Simulated FMS Provider');
    });

    it('should return correct capabilities', () => {
      const capabilities = provider.getCapabilities();
      
      expect(capabilities.supportsTenantSync).toBe(true);
      expect(capabilities.supportsUnitSync).toBe(true);
      expect(capabilities.supportsWebhooks).toBe(true);
      expect(capabilities.supportsRealtime).toBe(false);
    });
  });

  describe('Connection Testing', () => {
    it('should return true if data file exists and is valid', async () => {
      createTestDataFile({
        tenants: [],
        units: [],
      });

      const result = await provider.testConnection();
      expect(result).toBe(true);
    });

    it('should return true even if data file does not exist', async () => {
      // Provider returns empty data if file missing
      const result = await provider.testConnection();
      expect(result).toBe(true);
    });
  });

  describe('Fetch Tenants', () => {
    it('should fetch tenants from data file', async () => {
      createTestDataFile({
        tenants: [
          {
            id: 'fms-tenant-001',
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Smith',
            phone: '555-1234',
            unitIds: ['fms-unit-101'],
            status: 'active',
          },
        ],
        units: [],
      });

      const tenants = await provider.fetchTenants();

      expect(tenants).toHaveLength(1);
      expect(tenants[0]).toMatchObject({
        externalId: 'fms-tenant-001',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Smith',
        phone: '555-1234',
        unitIds: ['fms-unit-101'],
        status: 'active',
      });
    });

    it('should return empty array if no tenants in file', async () => {
      createTestDataFile({
        tenants: [],
        units: [],
      });

      const tenants = await provider.fetchTenants();
      expect(tenants).toHaveLength(0);
    });

    it('should return empty array if file does not exist', async () => {
      // Don't create file
      const tenants = await provider.fetchTenants();
      expect(tenants).toHaveLength(0);
    });

    it('should handle malformed data gracefully', async () => {
      fs.writeFileSync(testDataPath, 'invalid json{{{');

      const tenants = await provider.fetchTenants();
      expect(tenants).toHaveLength(0);
    });
  });

  describe('Fetch Units', () => {
    it('should fetch units from data file', async () => {
      createTestDataFile({
        tenants: [],
        units: [
          {
            id: 'fms-unit-101',
            unitNumber: 'A-101',
            unitType: 'storage',
            size: '10x10',
            status: 'occupied',
            tenantId: 'fms-tenant-001',
            monthlyRate: 150,
          },
        ],
      });

      const units = await provider.fetchUnits();

      expect(units).toHaveLength(1);
      expect(units[0]).toMatchObject({
        externalId: 'fms-unit-101',
        unitNumber: 'A-101',
        unitType: 'storage',
        size: '10x10',
        status: 'occupied',
        tenantId: 'fms-tenant-001',
        monthlyRate: 150,
      });
    });

    it('should return empty array if no units in file', async () => {
      createTestDataFile({
        tenants: [],
        units: [],
      });

      const units = await provider.fetchUnits();
      expect(units).toHaveLength(0);
    });
  });

  describe('Fetch Individual Entities', () => {
    beforeEach(() => {
      createTestDataFile({
        tenants: [
          { id: 'fms-tenant-001', email: 'john@example.com', firstName: 'John', lastName: 'Smith', unitIds: [] },
          { id: 'fms-tenant-002', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe', unitIds: [] },
        ],
        units: [
          { id: 'fms-unit-101', unitNumber: 'A-101', status: 'occupied' },
          { id: 'fms-unit-102', unitNumber: 'A-102', status: 'available' },
        ],
      });
    });

    it('should fetch specific tenant by external ID', async () => {
      const tenant = await provider.fetchTenant('fms-tenant-001');

      expect(tenant).not.toBeNull();
      expect(tenant?.externalId).toBe('fms-tenant-001');
      expect(tenant?.email).toBe('john@example.com');
    });

    it('should return null if tenant not found', async () => {
      const tenant = await provider.fetchTenant('nonexistent');
      expect(tenant).toBeNull();
    });

    it('should fetch specific unit by external ID', async () => {
      const unit = await provider.fetchUnit('fms-unit-101');

      expect(unit).not.toBeNull();
      expect(unit?.externalId).toBe('fms-unit-101');
      expect(unit?.unitNumber).toBe('A-101');
    });

    it('should return null if unit not found', async () => {
      const unit = await provider.fetchUnit('nonexistent');
      expect(unit).toBeNull();
    });
  });

  describe('Live Reload (No Caching)', () => {
    it('should fetch new data when file is updated between calls', async () => {
      // First fetch
      createTestDataFile({
        tenants: [{ id: 'tenant-1', email: 'user1@example.com', firstName: 'User', lastName: 'One', unitIds: [] }],
        units: [],
      });

      const tenants1 = await provider.fetchTenants();
      expect(tenants1).toHaveLength(1);
      expect(tenants1[0]?.email).toBe('user1@example.com');

      // Update file (simulating live editing)
      createTestDataFile({
        tenants: [
          { id: 'tenant-1', email: 'user1@example.com', firstName: 'User', lastName: 'One', unitIds: [] },
          { id: 'tenant-2', email: 'user2@example.com', firstName: 'User', lastName: 'Two', unitIds: [] },
        ],
        units: [],
      });

      // Second fetch - should see new tenant (not cached)
      const tenants2 = await provider.fetchTenants();
      expect(tenants2).toHaveLength(2);
      expect(tenants2[1]?.email).toBe('user2@example.com');
    });

    it('should fetch updated data when tenant info changes', async () => {
      // Initial data
      createTestDataFile({
        tenants: [{ id: 'tenant-1', email: 'john@example.com', firstName: 'John', lastName: 'Smith', unitIds: [] }],
        units: [],
      });

      const tenants1 = await provider.fetchTenants();
      expect(tenants1[0]?.firstName).toBe('John');

      // Update name
      createTestDataFile({
        tenants: [{ id: 'tenant-1', email: 'john@example.com', firstName: 'Jonathan', lastName: 'Smith', unitIds: [] }],
        units: [],
      });

      // Should see updated name
      const tenants2 = await provider.fetchTenants();
      expect(tenants2[0]?.firstName).toBe('Jonathan');
    });
  });

  describe('Webhook Support', () => {
    it('should validate webhook signature', async () => {
      const payload: any = { event_type: 'tenant.updated', data: {} };
      const validSignature = 'simulated-webhook-signature-test';

      const isValid = await provider.validateWebhook(payload, validSignature);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', async () => {
      const payload: any = { event_type: 'tenant.updated', data: {} };
      const invalidSignature = 'wrong-signature';

      const isValid = await provider.validateWebhook(payload, invalidSignature);
      expect(isValid).toBe(false);
    });

    it('should parse webhook payload', async () => {
      const rawPayload = {
        event_type: 'tenant.created',
        timestamp: '2025-01-04T10:00:00Z',
        facility_id: facilityId,
        data: { tenantId: 'tenant-123' },
      };

      const parsed = await provider.parseWebhookPayload(rawPayload);

      expect(parsed.event_type).toBe('tenant.created');
      expect(parsed.facility_external_id).toBe(facilityId);
    });
  });
});
