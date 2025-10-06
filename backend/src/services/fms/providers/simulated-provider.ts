/**
 * Simulated FMS Provider
 * 
 * A mock provider that reads data from a config file for testing and demos.
 * Does NOT cache data, allowing live updates during testing.
 */

import { BaseFMSProvider } from '../base-fms-provider';
import { 
  FMSTenant, 
  FMSUnit, 
  FMSProviderCapabilities,
  FMSWebhookPayload 
} from '@/types/fms.types';
import * as fs from 'fs';
import * as path from 'path';

export class SimulatedProvider extends BaseFMSProvider {
  private dataFilePath: string;

  constructor(facilityId: string, config: any) {
    super(facilityId, config);
    
    // Data file path from config or default
    this.dataFilePath = config.customSettings?.dataFilePath || 
      path.join(process.cwd(), 'config', 'fms-simulated-data.json');
  }

  getProviderName(): string {
    return 'Simulated FMS Provider';
  }

  getCapabilities(): FMSProviderCapabilities {
    return {
      supportsTenantSync: true,
      supportsUnitSync: true,
      supportsWebhooks: true,
      supportsRealtime: false,
      supportsLeaseManagement: true,
      supportsPaymentIntegration: false,
      supportsBulkOperations: false,
      rateLimits: {
        requestsPerMinute: 1000, // No real limits for simulation
        requestsPerHour: 60000,
      },
    };
  }

  /**
   * Read data from file (NOT cached - reads fresh every time)
   */
  private readSimulatedData(): SimulatedFMSData {
    try {
      // Always read from disk (no caching) for live testing
      const fileContent = fs.readFileSync(this.dataFilePath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      this.logger.info(`[Simulated FMS] Loaded data from ${this.dataFilePath}`, {
        tenants: data.tenants?.length || 0,
        units: data.units?.length || 0,
        facility_id: this.facilityId,
      });

      return data;
    } catch (error) {
      this.logger.error(`[Simulated FMS] Failed to read data file: ${this.dataFilePath}`, error);
      
      // Return empty data if file doesn't exist or is invalid
      return {
        tenants: [],
        units: [],
        metadata: {
          simulatedDataVersion: '1.0',
          lastUpdated: new Date().toISOString(),
        },
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test if we can read the data file
      this.readSimulatedData();
      
      this.logger.info(`[Simulated FMS] Connection test successful for facility ${this.facilityId}`);
      return true;
    } catch (error) {
      this.logger.error(`[Simulated FMS] Connection test failed:`, error);
      return false;
    }
  }

  async fetchTenants(): Promise<FMSTenant[]> {
    // Throttle for better UI visualization (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const data = this.readSimulatedData();
    
    // Filter tenants for this facility if specified
    let tenants = data.tenants || [];
    if (data.metadata?.facilityId && data.metadata.facilityId !== this.facilityId) {
      this.logger.warn(`[Simulated FMS] Data file is for facility ${data.metadata.facilityId}, but syncing ${this.facilityId}`);
    }

    // Map to our standard format
    return tenants.map(t => this.mapSimulatedTenant(t));
  }

  async fetchUnits(): Promise<FMSUnit[]> {
    // Throttle for better UI visualization (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const data = this.readSimulatedData();
    
    // Filter units for this facility if specified
    let units = data.units || [];
    if (data.metadata?.facilityId && data.metadata.facilityId !== this.facilityId) {
      this.logger.warn(`[Simulated FMS] Data file is for facility ${data.metadata.facilityId}, but syncing ${this.facilityId}`);
    }

    // Map to our standard format
    return units.map(u => this.mapSimulatedUnit(u));
  }

  async fetchTenant(externalId: string): Promise<FMSTenant | null> {
    const data = this.readSimulatedData();
    const tenant = (data.tenants || []).find(t => t.id === externalId);
    
    return tenant ? this.mapSimulatedTenant(tenant) : null;
  }

  async fetchUnit(externalId: string): Promise<FMSUnit | null> {
    const data = this.readSimulatedData();
    const unit = (data.units || []).find(u => u.id === externalId);
    
    return unit ? this.mapSimulatedUnit(unit) : null;
  }

  async validateWebhook(_payload: FMSWebhookPayload, signature: string): Promise<boolean> {
    // For simulated provider, just check if signature matches a test signature
    const testSignature = 'simulated-webhook-signature-test';
    return signature === testSignature;
  }

  async parseWebhookPayload(rawPayload: any): Promise<FMSWebhookPayload> {
    return {
      event_type: rawPayload.event_type || 'tenant.updated',
      timestamp: rawPayload.timestamp || new Date().toISOString(),
      facility_external_id: rawPayload.facility_id || this.facilityId,
      data: rawPayload.data || rawPayload,
      signature: rawPayload.signature,
    };
  }

  /**
   * Map simulated tenant to standard format
   */
  private mapSimulatedTenant(tenant: any): FMSTenant {
    const mapped: FMSTenant = {
      externalId: tenant.id || tenant.externalId,
      email: tenant.email,
      firstName: tenant.firstName || tenant.first_name,
      lastName: tenant.lastName || tenant.last_name,
      phone: tenant.phone,
      unitIds: tenant.unitIds || tenant.units || [],
      status: tenant.status || 'active',
      customFields: tenant.customFields || {},
    };

    if (tenant.leaseStartDate) {
      mapped.leaseStartDate = new Date(tenant.leaseStartDate);
    }
    
    if (tenant.leaseEndDate) {
      mapped.leaseEndDate = new Date(tenant.leaseEndDate);
    }

    return mapped;
  }

  /**
   * Map simulated unit to standard format
   */
  private mapSimulatedUnit(unit: any): FMSUnit {
    return {
      externalId: unit.id || unit.externalId,
      unitNumber: unit.unitNumber || unit.unit_number,
      unitType: unit.unitType || unit.type || 'storage',
      size: unit.size,
      status: unit.status || 'available',
      tenantId: unit.tenantId || unit.tenant_id,
      monthlyRate: unit.monthlyRate || unit.rate,
      customFields: unit.customFields || {},
    };
  }
}

/**
 * Simulated FMS Data Structure
 */
interface SimulatedFMSData {
  tenants: any[];
  units: any[];
  metadata?: {
    facilityId?: string;
    simulatedDataVersion?: string;
    lastUpdated?: string;
    description?: string;
  };
}
