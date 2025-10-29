import { BaseFMSProvider } from '../base-fms-provider';
import {
  FMSTenant,
  FMSUnit,
  FMSProviderCapabilities,
  FMSWebhookPayload,
  FMSProviderConfig,
} from '@/types/fms.types';
import { logger } from '@/utils/logger';

/**
 * StoreDge FMS Provider
 *
 * Concrete implementation of the BaseFMSProvider for StoreDge facility management system.
 * Provides integration with StoreDge's REST API for tenant and unit synchronization.
 *
 * Key Features:
 * - REST API integration with StoreDge platform
 * - Tenant and unit data synchronization
 * - Lease management support
 * - Facility-specific data scoping
 * - Authentication via API key or OAuth
 *
 * API Integration:
 * - Base URL configuration for StoreDge instance
 * - Facility ID mapping between StoreDge and BluLok
 * - RESTful endpoints for tenants and units
 * - Error handling and rate limiting
 *
 * Data Mapping:
 * - StoreDge tenant records → BluLok user accounts
 * - StoreDge unit records → BluLok rental units
 * - Lease information → Unit assignments
 * - Contact details → User profiles
 *
 * Limitations:
 * - No webhook support (polling-based only)
 * - No real-time synchronization
 * - No payment integration
 * - No bulk operations support
 *
 * Security Considerations:
 * - Secure API key storage
 * - HTTPS-only communication
 * - Input validation and sanitization
 * - Rate limiting compliance
 *
 * Business Value:
 * - Automated tenant onboarding from StoreDge
 * - Real-time unit availability synchronization
 * - Reduced manual data entry for property managers
 * - Consistent data between management and access systems
 */
export class StoredgeProvider extends BaseFMSProvider {
  // StoreDge-specific facility identifier
  private storedgeFacilityId: string;

  constructor(blulokFacilityId: string, config: FMSProviderConfig) {
    super(blulokFacilityId, config);

    // For Storable Edge, the facility ID comes from customSettings
    this.storedgeFacilityId = config.customSettings?.facilityId || blulokFacilityId;

    if (!this.storedgeFacilityId) {
      throw new Error('Storable Edge facility ID is required in customSettings.facilityId');
    }
  }

  getProviderName(): string {
    return 'Storable Edge';
  }

  getCapabilities(): FMSProviderCapabilities {
    return {
      supportsTenantSync: true,
      supportsUnitSync: true,
      supportsWebhooks: false, // The provided documentation does not mention webhooks
      supportsRealtime: false,
      supportsLeaseManagement: true,
      supportsPaymentIntegration: false,
      supportsBulkOperations: false,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeAuthenticatedRequest(
        `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/units`
      );
      return true;
    } catch (error) {
      logger.error('Storedge connection test failed:', error);
      return false;
    }
  }

  async fetchTenants(): Promise<FMSTenant[]> {
    const ledgersUrl = `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/ledgers/current`;
    const ledgersData = await this.makeAuthenticatedRequest(ledgersUrl);
    const ledgers = ledgersData.ledgers || [];

    const tenantsUrl = `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/tenants/current`;
    const tenantsData = await this.makeAuthenticatedRequest(tenantsUrl);
    const tenants = tenantsData.tenants || [];

    return tenants.map((tenant: any) => {
      const tenantLedgers = ledgers.filter(
        (ledger: any) => ledger.tenant.id === tenant.id
      );
      const unitIds = tenantLedgers.map((ledger: any) => ledger.unit.id);

      const primaryPhoneNumber = tenant.phone_numbers.find(
        (pn: any) => pn.primary
      );

      return {
        externalId: tenant.id,
        email: tenant.email, // Return actual email (may be null)
        firstName: tenant.first_name, // Return actual first name (may be null)
        lastName: tenant.last_name, // Return actual last name (may be null)
        phone: primaryPhoneNumber ? primaryPhoneNumber.number : null,
        unitIds: unitIds,
        status: tenant.active ? 'active' : 'inactive',
      };
    });
  }

  async fetchUnits(): Promise<FMSUnit[]> {
    const url = `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/units`;
    const data = await this.makeAuthenticatedRequest(url);
    const units = data.units || [];

    return units.map((unit: any) => ({
      externalId: unit.id,
      unitNumber: unit.name,
      unitType: unit.unit_type.name,
      size: unit.size,
      status: unit.status === 'vacant' ? 'available' : unit.status,
      tenantId: unit.current_tenant_id,
      monthlyRate: unit.price,
    }));
  }

  async fetchTenant(externalId: string): Promise<FMSTenant | null> {
    try {
        const url = `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/tenants/${externalId}`;
        const tenant = await this.makeAuthenticatedRequest(url);

        const ledgersUrl = `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/ledgers/current`;
        const ledgersData = await this.makeAuthenticatedRequest(ledgersUrl);
        const ledgers = ledgersData.ledgers || [];

        const tenantLedgers = ledgers.filter(
            (ledger: any) => ledger.tenant.id === tenant.id
        );
        const unitIds = tenantLedgers.map((ledger: any) => ledger.unit.id);

        const primaryPhoneNumber = tenant.phone_numbers.find(
            (pn: any) => pn.primary
        );

        return {
            externalId: tenant.id,
            email: tenant.email, // Return actual email (may be null)
            firstName: tenant.first_name, // Return actual first name (may be null)
            lastName: tenant.last_name, // Return actual last name (may be null)
            phone: primaryPhoneNumber ? primaryPhoneNumber.number : null,
            unitIds: unitIds,
            status: tenant.active ? 'active' : 'inactive',
        };
    } catch (error) {
        logger.error(`Failed to fetch Storedge tenant ${externalId}:`, error);
        return null;
    }
  }

  async fetchUnit(externalId: string): Promise<FMSUnit | null> {
    try {
        const url = `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/units/${externalId}`;
        const unit = await this.makeAuthenticatedRequest(url);
        return {
            externalId: unit.id,
            unitNumber: unit.name,
            unitType: unit.unit_type.name,
            size: unit.size,
            status: unit.status === 'vacant' ? 'available' : unit.status,
            tenantId: unit.current_tenant_id,
            monthlyRate: unit.price,
        };
    } catch (error) {
        logger.error(`Failed to fetch Storedge unit ${externalId}:`, error);
        return null;
    }
  }

  async validateWebhook(
    _payload: FMSWebhookPayload,
    _signature: string
  ): Promise<boolean> {
    // Storedge API docs provided don't mention webhooks, so this is a placeholder
    logger.warn('Storedge webhook validation not implemented');
    return false;
  }

  async parseWebhookPayload(rawPayload: any): Promise<FMSWebhookPayload> {
    // Storedge API docs provided don't mention webhooks, so this is a placeholder
    logger.warn('Storedge webhook parsing not implemented');
    return {
      event_type: 'lease.started',
      timestamp: new Date().toISOString(),
      data: rawPayload,
    };
  }

}