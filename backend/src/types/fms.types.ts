/**
 * FMS (Facility Management System) Integration Types
 * 
 * This module defines the types and interfaces for integrating with
 * various third-party Facility Management Systems.
 */

export enum FMSProviderType {
  STOREDGE = 'storedge',
  GENERIC_REST = 'generic_rest', // Generic REST API integration
  SIMULATED = 'simulated', // For testing and demos
}

export enum FMSAuthType {
  API_KEY = 'api_key',
  OAUTH2 = 'oauth2',
  OAUTH1 = 'oauth1',
  BASIC_AUTH = 'basic_auth',
  BEARER_TOKEN = 'bearer_token',
  CUSTOM = 'custom',
}

export enum FMSSyncStatus {
  IDLE = 'idle',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PENDING_REVIEW = 'pending_review',
}

export enum FMSChangeType {
  TENANT_ADDED = 'tenant_added',
  TENANT_REMOVED = 'tenant_removed',
  TENANT_UPDATED = 'tenant_updated',
  TENANT_UNIT_CHANGED = 'tenant_unit_changed',
  UNIT_ADDED = 'unit_added',
  UNIT_REMOVED = 'unit_removed',
  UNIT_UPDATED = 'unit_updated',
  UNIT_OVERLOCK_CHANGED = 'unit_overlock_changed',
}

export enum FMSChangeAction {
  ADD_ACCESS = 'add_access',
  REMOVE_ACCESS = 'remove_access',
  UPDATE_USER = 'update_user',
  CREATE_USER = 'create_user',
  DEACTIVATE_USER = 'deactivate_user',
  ASSIGN_UNIT = 'assign_unit',
  UNASSIGN_UNIT = 'unassign_unit',
}

/** How inbound FMS webhooks authenticate to BluLok Cloud. */
export enum FMSWebhookAuthMode {
  HMAC = 'hmac',
  NONE = 'none',
  HEADER_SECRET = 'header_secret',
}

/**
 * Controls whether newly created FMS tenants receive invite SMS/email.
 * Unset / unknown values resolve to NONE (no automatic invites).
 */
export enum FMSInvitePolicy {
  /** Never auto-send invites (default). Admins can still invite manually. */
  NONE = 'none',
  /** Auto-send only when the tenant is assigned to a unit with a BluLok device. */
  DEVICE_EQUIPPED = 'device_equipped',
  /** Auto-send to every non-placeholder tenant with contact info. */
  ALL = 'all',
}

export interface FMSAuthConfig {
  type: FMSAuthType;
  credentials: {
    apiKey?: string;
    username?: string;
    password?: string;
    bearerToken?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    tokenEndpoint?: string;
    consumerKey?: string; // OAuth1 consumer key
    consumerSecret?: string; // OAuth1 consumer secret
    [key: string]: any; // Allow custom auth fields
  };
}

export interface FMSProviderConfig {
  providerType: FMSProviderType;
  baseUrl?: string;
  apiVersion?: string;
  auth: FMSAuthConfig;
  features: {
    supportsTenantSync: boolean;
    supportsUnitSync: boolean;
    supportsWebhooks: boolean;
    supportsRealtime: boolean;
  };
  syncSettings: {
    /** Auto-apply changes from full / manual sync (and future scheduled sync). */
    autoAcceptChanges: boolean;
    /** Auto-apply changes from inbound webhooks. Falls back to autoAcceptChanges when unset. */
    autoAcceptWebhookChanges?: boolean;
    syncInterval?: number; // Minutes between automatic syncs
    webhookUrl?: string; // Our webhook URL for this facility
    /** hmac (default) | header_secret | none */
    webhookAuthMode?: FMSWebhookAuthMode;
    /** HMAC signing key or static header secret value */
    webhookSecret?: string;
    /** Header name for header_secret mode (default Authorization) */
    webhookAuthHeader?: string;
    /** Header name for hmac mode (default X-Storable-Signature) */
    webhookSignatureHeader?: string;
    /**
     * When to send invite SMS/email for newly created FMS tenants.
     * Defaults to `none` when unset (suppresses spam during partial adoption).
     */
    invitePolicy?: FMSInvitePolicy;
  };
  customSettings?: Record<string, any>; // Provider-specific settings
}

export interface FMSConfiguration {
  id: string;
  facility_id: string;
  provider_type: FMSProviderType;
  is_enabled: boolean;
  config: FMSProviderConfig;
  last_sync_at?: Date;
  last_sync_status?: FMSSyncStatus;
  created_at: Date;
  updated_at: Date;
}

export interface FMSTenant {
  externalId: string; // ID from FMS
  email: string | null; // Can be null for invalid tenants
  firstName: string | null; // Can be null for invalid tenants
  lastName: string | null; // Can be null for invalid tenants
  phone?: string;
  unitIds: string[]; // External unit IDs from FMS
  leaseStartDate?: Date;
  leaseEndDate?: Date;
  status: 'active' | 'inactive' | 'pending';
  customFields?: Record<string, any>;
}

export interface FMSUnit {
  externalId: string; // ID from FMS
  unitNumber: string;
  unitType?: string;
  size?: string;
  status: 'available' | 'occupied' | 'maintenance' | 'reserved';
  tenantId?: string; // External tenant ID from FMS
  monthlyRate?: number;
  customFields?: Record<string, any>;
}

export interface FMSChange {
  id: string;
  sync_log_id: string;
  change_type: FMSChangeType;
  entity_type: 'tenant' | 'unit';
  external_id: string; // FMS entity ID
  internal_id?: string; // Our entity ID (if exists)
  before_data?: any;
  after_data?: any | null;
  required_actions: FMSChangeAction[];
  impact_summary: string;
  is_reviewed: boolean;
  is_accepted?: boolean;
  applied_at?: Date;
  created_at: Date;
  // Validation fields
  is_valid?: boolean; // Whether this change is valid and can be applied
  validation_errors?: string[]; // List of validation error messages
}

export interface FMSSyncLog {
  id: string;
  facility_id: string;
  fms_config_id: string;
  sync_status: FMSSyncStatus;
  started_at: Date;
  completed_at?: Date;
  triggered_by: 'manual' | 'automatic' | 'webhook';
  triggered_by_user_id?: string;
  changes_detected: number;
  changes_applied: number;
  changes_pending: number;
  changes_rejected: number;
  error_message?: string;
  sync_summary?: {
    tenants_synced: number;
    units_synced: number;
    errors: string[];
    warnings: string[];
    /** True only when this sync run applied changes via facility auto-accept (not widget-only). */
    changes_auto_applied?: boolean;
  };
  created_at: Date;
  updated_at: Date;
}

export interface FMSSyncResult {
  success: boolean;
  syncLogId: string;
  changesDetected: FMSChange[];
  summary: {
    tenantsAdded: number;
    tenantsRemoved: number;
    tenantsUpdated: number;
    unitsAdded: number;
    unitsRemoved: number;
    unitsUpdated: number;
    errors: string[];
    warnings: string[];
  };
  requiresReview: boolean;
}

/** Structured failure from applyChanges for user-facing summaries. */
export interface FMSApplyErrorDetail {
  changeId: string;
  changeType: FMSChangeType;
  entityType: 'tenant' | 'unit';
  externalId: string;
  /** Human label (unit number, email, name) — prefer over externalId in UI. */
  entityLabel: string;
  /** Underlying Error.message only (no change_type / id wrapper). */
  message: string;
}

export interface FMSChangeApplicationResult {
  success: boolean;
  changesApplied: number;
  changesFailed: number;
  errors: string[];
  errorDetails: FMSApplyErrorDetail[];
  appliedChangeIds: string[];
  failedChangeIds: string[];
  accessChanges: {
    usersCreated: string[];
    usersDeactivated: string[];
    accessGranted: Array<{ userId: string; unitId: string }>;
    accessRevoked: Array<{ userId: string; unitId: string }>;
  };
}

/**
 * Cached context passed through the apply-change pipeline to avoid
 * redundant DB lookups for the same sync-log on every change.
 */
export interface FMSApplyContext {
  facilityId: string;
  performedBy: string;
  /** Cached for the duration of a single apply batch */
  config?: FMSConfiguration | null;
  /** Cached unit external_id → mapping for the facility */
  unitMappingsByExternalId?: Map<string, { internal_id: string; external_id: string; metadata?: Record<string, unknown> }>;
}

/** Storable Edge CloudEvents envelope (https://webhooks.storable.io/event-catalog) */
export interface StoredgeCloudEventEnvelope {
  id: string;
  time: string;
  type: StoredgeWebhookEventType;
  attempt_number?: number;
  sent_at?: string;
  body: Record<string, unknown>;
}

export type StoredgeWebhookEventType =
  | 'com.storedge.tenant.created.v1'
  | 'com.storedge.tenant.updated.v1'
  | 'com.storedge.ledger.moved-in.v1'
  | 'com.storedge.ledger.moved-out.v1'
  | 'com.storedge.lead.moved-in.v1'
  | 'com.storedge.unit.created.v1'
  | 'com.storedge.unit.deleted.v1'
  | 'com.storedge.unit.overlock-applied.v1'
  | 'com.storedge.unit.overlock-removed.v1';

export type FMSWebhookEventType =
  | 'tenant.created'
  | 'tenant.updated'
  | 'ledger.moved-in'
  | 'ledger.moved-out'
  | 'lead.moved-in'
  | 'unit.created'
  | 'unit.deleted'
  | 'unit.overlock-applied'
  | 'unit.overlock-removed';

export type FMSWebhookDisposition = 'apply' | 'ignored';

export type FMSWebhookRecordStatus = 'received' | 'processed' | 'failed' | 'ignored';

/** Normalized webhook payload after provider parsing */
export interface FMSWebhookPayload {
  externalEventId: string;
  event_type: string;
  timestamp: string;
  facility_external_id: string;
  data: Record<string, unknown>;
  /** When set, webhook apply uses this type (e.g. lead.moved-in → ledger.moved-in). */
  applyAs?: FMSWebhookEventType;
  disposition?: FMSWebhookDisposition;
  rawType?: string;
}

/** Recent webhook activity pushed over WS and shown in the FMS tab feed. */
export interface FMSWebhookFeedItem {
  id: string;
  facilityId: string;
  eventType: string;
  externalEventId: string;
  receivedAt: string;
  summary: Record<string, unknown>;
  summaryText: string;
  changesDetected: number;
  changesApplied: number;
  autoApplied: boolean;
  requiresReview: boolean;
  syncLogId: string;
  status?: FMSWebhookRecordStatus;
  errorMessage?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface StoredgeTenantEventBody {
  company_id: string;
  facility_id: string;
  tenant_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  delinquent?: boolean;
  source_id?: string | null;
}

export interface StoredgeLedgerEventBody {
  company_id: string;
  facility_id: string;
  ledger_id: string;
  tenant_id: string;
  unit_id: string;
  move_in_date?: string;
  move_out_event_id?: string;
  desired_move_out_date?: string;
  source_id?: string | null;
}

export interface StoredgeUnitIdEventBody {
  company_id: string;
  facility_id: string;
  unit_id: string;
  tenant_id?: string;
  ledger_id?: string;
  source_id?: string | null;
}

/**
 * FMS Provider capabilities
 */
export interface FMSProviderCapabilities {
  supportsTenantSync: boolean;
  supportsUnitSync: boolean;
  supportsWebhooks: boolean;
  supportsRealtime: boolean;
  supportsLeaseManagement: boolean;
  supportsPaymentIntegration: boolean;
  supportsBulkOperations: boolean;
  rateLimits?: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

