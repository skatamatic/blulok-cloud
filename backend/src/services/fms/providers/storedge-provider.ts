import { BaseFMSProvider } from '../base-fms-provider';
import {
  FMSTenant,
  FMSUnit,
  FMSProviderCapabilities,
  FMSWebhookPayload,
  FMSProviderConfig,
  StoredgeCloudEventEnvelope,
} from '@/types/fms.types';
import { logger } from '@/utils/logger';
import { validateFmsWebhookAuth } from '../fms-webhook-auth';
import { resolveStoredgeWebhookType } from '../storedge-webhook-events';
import { unwrapStoredgeEntity } from '../storedge-api.utils';

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
 * - Webhook support for real-time CloudEvents from Storable Edge
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

    // Avoid double slashes in URLs (e.g. baseUrl ending with /) which can break signing or routing.
    this.config.baseUrl = (this.config.baseUrl || '').trim().replace(/\/+$/, '');

    // Common typo: api.storegdgefms.com (extra "g") → ENOTFOUND. Auto-correct; fix saved config in UI when possible.
    const typoHost = /storegdgefms\.com/i;
    if (typoHost.test(this.config.baseUrl)) {
      logger.warn(
        'FMS Storable Edge: API URL had hostname typo storegdgefms.com; using storedgefms.com. Update the facility FMS base URL in settings.'
      );
      this.config.baseUrl = this.config.baseUrl.replace(typoHost, 'storedgefms.com');
    }

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
      supportsWebhooks: true,
      supportsRealtime: true,
      supportsLeaseManagement: true,
      supportsPaymentIntegration: false,
      supportsBulkOperations: false,
    };
  }

  /**
   * Storable Edge paginates collections (default 100 per page). Follow meta.pagination.next_page
   * until exhausted so sync sees all units, tenants, and ledgers.
   */
  private async fetchAllPages(resourcePath: string, collectionKey: string): Promise<any[]> {
    const aggregated: any[] = [];
    let page = 1;
    const perPage = 100;
    const maxPages = 500;

    for (let i = 0; i < maxPages; i++) {
      const url = new URL(
        `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/${resourcePath}`
      );
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(perPage));

      const data = await this.makeAuthenticatedRequest(url.toString());
      const chunk = data[collectionKey];
      if (Array.isArray(chunk) && chunk.length > 0) {
        aggregated.push(...chunk);
      }

      const nextPage = data.meta?.pagination?.next_page;
      if (nextPage == null) {
        break;
      }
      page = nextPage;
    }

    return aggregated;
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = new URL(`${this.config.baseUrl}/v1/${this.storedgeFacilityId}/units`);
      url.searchParams.set('page', '1');
      url.searchParams.set('per_page', '1');
      await this.makeAuthenticatedRequest(url.toString());
      return true;
    } catch (error) {
      logger.error('Storedge connection test failed:', error);
      return false;
    }
  }

  async fetchTenants(): Promise<FMSTenant[]> {
    const ledgers = await this.fetchAllPages('ledgers/current', 'ledgers');
    const tenants = await this.fetchAllPages('tenants/current', 'tenants');

    return tenants.map((tenant: any) => {
      const tenantLedgers = ledgers.filter(
        (ledger: any) => ledger.tenant.id === tenant.id
      );
      const unitIds = tenantLedgers.map((ledger: any) => ledger.unit.id);

      const primaryPhoneNumber = (tenant.phone_numbers || []).find(
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
    const units = await this.fetchAllPages('units', 'units');

    return units.map((unit: any) => ({
      externalId: unit.id,
      unitNumber: unit.name,
      unitType: unit.unit_type?.name ?? '',
      size: unit.size,
      status: unit.status === 'vacant' ? 'available' : unit.status,
      tenantId: unit.current_tenant_id,
      monthlyRate: unit.price,
    }));
  }

  async fetchTenant(externalId: string): Promise<FMSTenant | null> {
    try {
        const url = `${this.config.baseUrl}/v1/${this.storedgeFacilityId}/tenants/${externalId}`;
        const raw = await this.makeAuthenticatedRequest(url);
        const tenant = unwrapStoredgeEntity(raw, ['tenant', 'data']) as any;
        if (!tenant) {
          logger.warn(`Storedge tenant ${externalId} response missing id`);
          return null;
        }

        const ledgers = await this.fetchAllPages('ledgers/current', 'ledgers');

        const tenantLedgers = ledgers.filter(
            (ledger: any) => ledger.tenant.id === tenant.id
        );
        const unitIds = tenantLedgers.map((ledger: any) => ledger.unit.id);

        const primaryPhoneNumber = (tenant.phone_numbers || []).find(
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
        const raw = await this.makeAuthenticatedRequest(url);
        const unit = unwrapStoredgeEntity(raw, ['unit', 'data']) as any;
        if (!unit) {
          logger.warn(`Storedge unit ${externalId} response missing id`);
          return null;
        }
        return {
            externalId: String(unit.id),
            unitNumber: unit.name,
            unitType: unit.unit_type?.name ?? '',
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

  private getWebhookSignatureHeaderName(): string {
    const custom = this.config.customSettings?.webhookSignatureHeader;
    return typeof custom === 'string' && custom.trim() ? custom.trim() : 'X-Storable-Signature';
  }

  validateWebhookRawBody(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const headers: Record<string, string | undefined> = {};
    if (signatureHeader) {
      headers[this.getWebhookSignatureHeaderName()] = signatureHeader;
    }
    return validateFmsWebhookAuth(
      this.config.syncSettings,
      this.config.customSettings,
      rawBody,
      headers
    ).valid;
  }

  async validateWebhook(_payload: FMSWebhookPayload, signature: string): Promise<boolean> {
    return Boolean(signature?.trim() && this.config.syncSettings.webhookSecret);
  }

  async parseWebhookPayload(rawPayload: unknown): Promise<FMSWebhookPayload> {
    let envelope: StoredgeCloudEventEnvelope;
    if (Buffer.isBuffer(rawPayload)) {
      envelope = JSON.parse(rawPayload.toString('utf8')) as StoredgeCloudEventEnvelope;
    } else if (typeof rawPayload === 'string') {
      envelope = JSON.parse(rawPayload) as StoredgeCloudEventEnvelope;
    } else {
      envelope = rawPayload as StoredgeCloudEventEnvelope;
    }

    if (!envelope?.type || !envelope?.id || !envelope?.body) {
      throw new Error('Invalid Storable CloudEvents envelope');
    }

    const resolved = resolveStoredgeWebhookType(envelope.type);

    const bodyFacilityId = String(envelope.body.facility_id ?? '');
    if (!bodyFacilityId) {
      throw new Error('Webhook body missing facility_id');
    }
    if (bodyFacilityId !== this.storedgeFacilityId) {
      throw new Error(
        `Facility ID mismatch: event facility ${bodyFacilityId} does not match configured Storable facility ${this.storedgeFacilityId}`
      );
    }

    return {
      externalEventId: envelope.id,
      event_type: resolved.eventType,
      timestamp: envelope.time ?? envelope.sent_at ?? new Date().toISOString(),
      facility_external_id: bodyFacilityId,
      data: envelope.body as Record<string, unknown>,
      applyAs: resolved.applyAs,
      disposition: resolved.disposition,
      rawType: envelope.type,
    };
  }

  mapTenantBodyToFMSTenant(body: Record<string, unknown>): FMSTenant {
    return {
      externalId: String(body.tenant_id),
      email: body.email != null ? String(body.email) : null,
      firstName: body.first_name != null ? String(body.first_name) : null,
      lastName: body.last_name != null ? String(body.last_name) : null,
      phone: body.phone != null ? String(body.phone) : undefined,
      unitIds: [],
      status: body.delinquent === true ? 'inactive' : 'active',
    };
  }

}