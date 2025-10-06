/**
 * Generic REST API FMS Provider
 * 
 * A generic implementation for FMS systems with RESTful APIs
 * This can be used as a base for specific providers or for custom integrations
 */

import { BaseFMSProvider } from '../base-fms-provider';
import { 
  FMSTenant, 
  FMSUnit, 
  FMSProviderCapabilities,
  FMSWebhookPayload 
} from '@/types/fms.types';

export class GenericRestProvider extends BaseFMSProvider {
  getProviderName(): string {
    return 'Generic REST API';
  }

  getCapabilities(): FMSProviderCapabilities {
    return {
      supportsTenantSync: true,
      supportsUnitSync: true,
      supportsWebhooks: this.config.features.supportsWebhooks ?? false,
      supportsRealtime: this.config.features.supportsRealtime ?? false,
      supportsLeaseManagement: false,
      supportsPaymentIntegration: false,
      supportsBulkOperations: false,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      this.validateConfig();

      // Make a test request to the base URL
      const testUrl = `${this.config.baseUrl}/health`;
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Generic REST provider connection test failed:', error);
      return false;
    }
  }

  async fetchTenants(): Promise<FMSTenant[]> {
    try {
      const url = this.buildUrl('/tenants');
      const data = await this.makeAuthenticatedRequest(url, 'GET');

      // Assuming the API returns an array of tenants
      // Map to our standard format
      return this.mapTenantsFromAPI(data.tenants || data);
    } catch (error) {
      this.logger.error('Failed to fetch tenants from Generic REST provider:', error);
      throw error;
    }
  }

  async fetchUnits(): Promise<FMSUnit[]> {
    try {
      const url = this.buildUrl('/units');
      const data = await this.makeAuthenticatedRequest(url, 'GET');

      // Assuming the API returns an array of units
      return this.mapUnitsFromAPI(data.units || data);
    } catch (error) {
      this.logger.error('Failed to fetch units from Generic REST provider:', error);
      throw error;
    }
  }

  async fetchTenant(externalId: string): Promise<FMSTenant | null> {
    try {
      const url = this.buildUrl(`/tenants/${externalId}`);
      const data = await this.makeAuthenticatedRequest(url, 'GET');

      return this.mapTenantFromAPI(data);
    } catch (error) {
      this.logger.error(`Failed to fetch tenant ${externalId}:`, error);
      return null;
    }
  }

  async fetchUnit(externalId: string): Promise<FMSUnit | null> {
    try {
      const url = this.buildUrl(`/units/${externalId}`);
      const data = await this.makeAuthenticatedRequest(url, 'GET');

      return this.mapUnitFromAPI(data);
    } catch (error) {
      this.logger.error(`Failed to fetch unit ${externalId}:`, error);
      return null;
    }
  }

  async validateWebhook(payload: FMSWebhookPayload, signature: string): Promise<boolean> {
    if (!this.config.syncSettings.webhookSecret) {
      this.logger.warn('No webhook secret configured');
      return false;
    }

    // Implement HMAC signature validation
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.config.syncSettings.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature;
  }

  async parseWebhookPayload(rawPayload: any): Promise<FMSWebhookPayload> {
    // Parse webhook payload from generic format
    // This would need to be customized per FMS provider
    return {
      event_type: rawPayload.event || rawPayload.type,
      timestamp: rawPayload.timestamp || new Date().toISOString(),
      facility_external_id: rawPayload.facility_id,
      data: rawPayload.data || rawPayload,
      signature: rawPayload.signature,
    };
  }

  /**
   * Build full URL with base URL and path
   */
  private buildUrl(path: string): string {
    const baseUrl = this.config.baseUrl || '';
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    if (this.config.apiVersion) {
      return `${baseUrl}/${this.config.apiVersion}${cleanPath}`;
    }
    
    return `${baseUrl}${cleanPath}`;
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    switch (this.config.auth.type) {
      case 'api_key':
        if (this.config.auth.credentials.apiKey) {
          headers['X-API-Key'] = this.config.auth.credentials.apiKey;
        }
        break;
      case 'bearer_token':
        if (this.config.auth.credentials.bearerToken) {
          headers['Authorization'] = `Bearer ${this.config.auth.credentials.bearerToken}`;
        }
        break;
    }

    return headers;
  }

  /**
   * Map tenants from API format to our standard format
   * This should be customized per FMS provider
   */
  private mapTenantsFromAPI(apiData: any[]): FMSTenant[] {
    return apiData.map(tenant => this.mapTenantFromAPI(tenant));
  }

  private mapTenantFromAPI(tenant: any): FMSTenant {
    const mapped: FMSTenant = {
      externalId: tenant.id || tenant.tenant_id,
      email: tenant.email,
      firstName: tenant.first_name || tenant.firstName,
      lastName: tenant.last_name || tenant.lastName,
      phone: tenant.phone || tenant.phone_number,
      unitIds: tenant.units || tenant.unit_ids || [],
      status: tenant.status || 'active',
      customFields: tenant.custom_fields || {},
    };

    // Only add optional date fields if they have valid values
    if (tenant.lease_start) {
      mapped.leaseStartDate = new Date(tenant.lease_start);
    }
    if (tenant.lease_end) {
      mapped.leaseEndDate = new Date(tenant.lease_end);
    }

    return mapped;
  }

  /**
   * Map units from API format to our standard format
   */
  private mapUnitsFromAPI(apiData: any[]): FMSUnit[] {
    return apiData.map(unit => this.mapUnitFromAPI(unit));
  }

  private mapUnitFromAPI(unit: any): FMSUnit {
    return {
      externalId: unit.id || unit.unit_id,
      unitNumber: unit.unit_number || unit.number,
      unitType: unit.type || unit.unit_type,
      size: unit.size || unit.square_feet,
      status: unit.status || 'available',
      tenantId: unit.tenant_id,
      monthlyRate: unit.rate || unit.monthly_rate,
      customFields: unit.custom_fields || {},
    };
  }
}

